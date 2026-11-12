// Brief 77 steps 4-5 in one pass: JANIS's own book generator, run as BarnBookMainThread.run() runs it, with one consumer
// added beside JANIS's own writers. Every search, page and number is JANIS's: the item searches are BarnBookMainThread's
// own methods called on its own instance (searchENDF_MF3Or10_MF6MT5, searchENDF_MF3_MT50to91, searchEXFOR_SF3_MT,
// searchEXFOR_SF3_X_SF4), the pages are built by JANIS's PlotterThread, written by JANIS's OutputThreadJNS and
// OutputThreadXML (the JNS pages, the XML pages and the navigation JANIS Web serves). The added consumer takes the same
// page objects while their data is loaded and writes, per page, each plotted series through JANIS's Tabler on the data's
// own X values (as `janis -table` does), the selection tree's labels in JANIS's order of refs, and the plot's ranges as
// JANIS computed them (a JNS keeps a range only where it differs from JANIS's automatic one):
//   <export>/<page stem>/{index.tsv, labels.tsv, ranges.tsv, <i>.csv}
// Options as BookRun: OFFICIAL, Q-value table off, -Dextra=<library>=<#rrggbb>,... for step 10.
//   java -cp "/opt/janis/*:." -Duser.dir=<book dir> [-Dextra=...] BookEngine "<LOCAL:...>" <letter> <threads> <export dir> [material]
import java.awt.BasicStroke;
import java.awt.Color;
import java.io.*;
import java.lang.reflect.Method;
import java.util.*;
import org.nea.janis.book.*;
import org.nea.janis.book.xml.OutputThreadJNS;
import org.nea.janis.book.xml.OutputThreadXML;
import org.nea.janis.connection.HelloAnswer;
import org.nea.janis.connection.JanisConnectionId;
import org.nea.janis.connection.JanisConnectionIdFactory;
import org.nea.janis.connection.JanisReadConnection;
import org.nea.janis.connection.JanisThreadSafeReadConnection;
import org.nea.janis.connection.pool.JanisReadConnectionsMux;
import org.nea.janis.database.CategoryId;
import org.nea.janis.database.DataSetId;
import org.nea.janis.database.DataTypeId;
import org.nea.janis.database.MaterialId;
import org.nea.janis.db.AbsoluteRefs;
import org.nea.janis.db.AbsoluteRefsHashSet;
import org.nea.janis.db.AbsoluteRefsSet;
import org.nea.janis.filters.ExportParametersTableCSV;
import org.nea.janis.filters.ExportTypeCSV;
import org.nea.janis.format.tools.ConsumerProducerQueue;
import org.nea.janis.ui.viewer.plotter.PlotterState;
import org.nea.janis.ui.viewer.tabler.TablerState;
import org.nea.janis.view.plot.ContinuousPlotProperty;
import org.nea.janis.view.plot.PlottingPlotterParameters;
import org.nea.janis.view.table.TableProducer;
import org.nea.math.units.NuclearUnit;
import org.nea.math.units.ValueRange;

public class BookEngine {
    static final BarnBookMainThread.Listener LOG = new BarnBookMainThread.Listener() {
        public synchronized void message(String m) { System.out.println(m); }
        public synchronized void checkProducersAchieved() { System.out.println("END"); }
        public synchronized void checkerException(String m, Throwable t) { System.out.println("EXCEPTION " + m); t.printStackTrace(System.out); }
    };

    public static void main(String[] args) throws Exception {
        BarnBook.settingsInitialization();
        JanisConnectionId connId = JanisConnectionIdFactory.buildFromString(args[0]);
        BarnBookOptions o = new BarnBookOptions();
        o.setOutputTypes(EnumSet.of(BarnBookOutputType.XML, BarnBookOutputType.JNS));
        o.setConnectionId(connId);
        o.setNbThreads(Integer.parseInt(args[2]));
        if (!BarnBookOptionsOfficial.setupHardCodedOptions(o, args[1])) throw new IllegalArgumentException(args[1]);
        o.setQValuesTable(false);
        String extra = System.getProperty("extra");
        if (extra != null && !extra.isEmpty()) {
            for (String spec : extra.split(",")) {
                String[] kv = spec.split("=");
                ContinuousPlotProperty pp = new ContinuousPlotProperty();
                pp.setColor(Color.decode(kv[1]));
                pp.setStroke(new BasicStroke(1.0f));
                o.getLibraries().add(new BarnBookOptions.Library(new DataSetId(kv[0]), pp, false));
                o.getInterLibraries().add(new DataSetId(kv[0]));
            }
        }
        if (args.length > 4) o.setSingleMaterial(MaterialId.decode(args[4]));
        File export = new File(args[3]);
        export.mkdirs();

        // BarnBookMainThread.run(), step by step, on JANIS's own instance
        BarnBookMainThread main = new BarnBookMainThread(o);
        main.setListener(LOG);
        JanisReadConnection raw = connId.openConnection();
        HelloAnswer hello = raw.hello();
        DataTypeId.register(hello.getDatatypeIds());
        CategoryId.register(hello.getCategoryIds());
        JanisThreadSafeReadConnection conn = new JanisThreadSafeReadConnection(raw);
        TreeMap<BarnBookItemKey, BarnBookItem> items = new TreeMap<>();
        call(main, "searchENDF_MF3Or10_MF6MT5", conn, items);
        call(main, "searchENDF_MF3_MT50to91", conn, items);
        LOG.message("Found " + items.size() + " ENDF items");
        Iterator<BarnBookItem> it = items.values().iterator();
        while (it.hasNext()) {
            BarnBookItem item = it.next();
            AbsoluteRefsSet endf = item.getENDFRefsSet();
            for (BarnBookOptions.Library lib : o.getLibraries()) {
                if (!lib.isRequired()) continue;
                boolean present = false;
                for (Object r : endf) if (lib.getDatasetId().equals(((AbsoluteRefs) r).getDatasetId())) { present = true; break; }
                if (!present) { it.remove(); break; }
            }
        }
        if (o.isEXFORIncluded()) {
            Iterator<BarnBookItem> it2 = items.values().iterator();
            while (it2.hasNext()) {
                BarnBookItem item = it2.next();
                AbsoluteRefsSet sf3 = (AbsoluteRefsSet) call(main, "searchEXFOR_SF3_MT", conn, item.getKey());
                AbsoluteRefsSet sf4 = (AbsoluteRefsSet) call(main, "searchEXFOR_SF3_X_SF4", conn, item.getKey());
                AbsoluteRefsHashSet all = new AbsoluteRefsHashSet();
                all.addAll(sf3);
                all.addAll(sf4);
                if (o.isEXFORRequired() && all.isEmpty()) { it2.remove(); continue; }
                item.getEXFORRefsSet().addAll(all);
            }
        }
        LOG.message("Keep " + items.size() + " items");
        try (PrintWriter w = new PrintWriter(new File(export, "items.tsv"), "UTF-8")) {
            for (BarnBookItemKey k : items.keySet()) w.println(k.getMaterialId().code() + "\t" + k.getReactionId().code());
        }
        List<Thread> outputs = new ArrayList<>();
        OutputThreadXML xml = new OutputThreadXML("OutputXML", o, items, LOG, new JanisReadConnectionsMux(conn));
        OutputThreadJNS jns = new OutputThreadJNS("OutputJNS", o, items, LOG, new JanisReadConnectionsMux(conn));
        ConsumerProducerQueue tq = new ConsumerProducerQueue(10);
        Thread tabler = new Thread(() -> tablerLoop(tq, o, export), "OutputTabler");
        List<ConsumerProducerQueue> queues = Arrays.asList(xml.getQueue(), jns.getQueue(), tq);
        xml.start(); jns.start(); tabler.start();
        ConsumerProducerQueue in = new ConsumerProducerQueue(50);
        Thread[] plotters = new Thread[o.getNbThreads()];
        for (int i = 0; i < plotters.length; i++) {
            plotters[i] = new PlotterThread("Plotter" + i, o, conn, null, in, queues, LOG);
            plotters[i].start();
        }
        long t1 = System.currentTimeMillis();
        for (BarnBookItem item : items.values()) in.push(item);
        while (!in.isEmpty()) Thread.sleep(500);
        in.close();
        for (Thread p : plotters) p.join();
        for (ConsumerProducerQueue q : queues) { while (!q.isEmpty()) Thread.sleep(500); q.close(); }
        xml.join(); jns.join(); tabler.join();
        raw.shutdown();
        LOG.message("Created " + items.size() + " pages in " + (System.currentTimeMillis() - t1) / 1000 + " s");
        System.exit(0);
    }

    static Object call(Object target, String name, Object... args) throws Exception {
        for (Method m : target.getClass().getDeclaredMethods()) {
            if (m.getName().equals(name) && m.getParameterTypes().length == args.length) {
                m.setAccessible(true);
                return m.invoke(target, args);
            }
        }
        throw new NoSuchMethodException(name);
    }

    static void tablerLoop(ConsumerProducerQueue q, BarnBookOptions o, File export) {
        int done = 0, failed = 0;
        while (q.isOpen()) {
            Object x = q.pull();
            if (x == null) continue;
            BarnBookPage p = (BarnBookPage) x;
            PlotterState ps = p.getPlotterState();
            if (ps == null) continue;
            BarnBookItemKey k = p.getKey();
            String stem = "book-" + o.getFilesystemLabel() + "-" + k.getDatatypeId().code() + "-" + k.getMaterialId().code() + "-" + k.getReactionId().code();
            try {
                synchronized (ps) { exportPage(ps, new File(export, stem)); }
                done++;
            } catch (Throwable t) {
                failed++;
                System.out.println("TABLER FAILED " + stem + " : " + t);
                t.printStackTrace(System.out);
            }
        }
        System.out.println("TABLER END done=" + done + " failed=" + failed);
    }

    /** The node JANIS plots: PlotterState wraps each producer in a CachedPlotProducer (its private field pp). */
    static Object unwrap(Object p) throws Exception {
        if (p instanceof org.nea.janis.view.plot.CachedPlotProducer) {
            java.lang.reflect.Field f = org.nea.janis.view.plot.CachedPlotProducer.class.getDeclaredField("pp");
            f.setAccessible(true);
            return f.get(p);
        }
        return p;
    }

    static void exportPage(PlotterState ps, File dir) throws Exception {
        dir.mkdirs();
        PlottingPlotterParameters pp = ps.getPlotterParameters();
        try (PrintWriter w = new PrintWriter(new File(dir, "ranges.tsv"), "UTF-8")) {
            ValueRange xr = pp.getXRange(), yr = pp.getYRange();
            w.println("x\t" + xr.getMin().doubleValue(NuclearUnit.ELECTRONVOLT) + "\t" + xr.getMax().doubleValue(NuclearUnit.ELECTRONVOLT) + "\t" + pp.getXScaleType());
            w.println("y\t" + yr.getMin().doubleValue(NuclearUnit.BARN) + "\t" + yr.getMax().doubleValue(NuclearUnit.BARN) + "\t" + pp.getYScaleType());
        }
        Map<AbsoluteRefs, ?> producers = ps.getDisplayedProducers();
        StringBuilder index = new StringBuilder();
        int i = 0;
        for (AbsoluteRefs refs : ps.getPlotProducersRefsOrder()) {
            Object p = unwrap(producers.get(refs));
            String cls = p == null ? "null" : p.getClass().getName();
            long rows = -1;
            if (p instanceof TableProducer) {
                TablerState ts = new TablerState();
                ts.addTableProducer(refs, (TableProducer) p);
                ts.setUseXValuesFromData(true);
                File csv = new File(dir, i + ".csv");
                try (OutputStream os = new BufferedOutputStream(new FileOutputStream(csv))) {
                    ExportParametersTableCSV params = new ExportParametersTableCSV();
                    params.setOutputStream(os);
                    params.setHeadersSaved(true);
                    params.setKeepUnits(true);
                    params.setSeparator(";");
                    ExportTypeCSV.getInstance().export(ts, params);
                }
                try (BufferedReader r = new BufferedReader(new FileReader(csv))) { rows = r.lines().count() - 1; }
            }
            String x4 = "";
            if (p instanceof org.nea.janis.format.exfor.data.EXFOR_DataPT) {
                org.nea.janis.format.exfor.data.EXFOR_DataPT d = (org.nea.janis.format.exfor.data.EXFOR_DataPT) p;
                org.nea.tools.PairNulls<String, Integer> fa = d.getFirstAuthorReferenceYear();
                x4 = (fa.getLeft() == null ? "" : fa.getLeft()) + "\t" + (fa.getRight() == null ? "" : fa.getRight()) + "\t" + d.getNbPoints();
            }
            index.append(i).append('\t').append(refs.toCodeString()).append('\t').append(cls).append('\t').append(rows).append('\t').append(x4).append('\n');
            i++;
        }
        TreeSet<AbsoluteRefs> sorted = new TreeSet<>(ps.getPlotProducersRefsOrder());
        StringBuilder labels = new StringBuilder();
        for (AbsoluteRefs refs : sorted) {
            labels.append(refs.toCodeString()).append('\t').append(refs.getDatasetId()).append('\t').append(refs.getCategoryId())
                  .append('\t').append(refs.getMaterialId().toShortString()).append('\t').append(refs.getDatablockId());
            for (org.nea.janis.data.DataId d : refs.getDataIds()) if (d != null) labels.append('\t').append(d);
            labels.append('\n');
        }
        try (Writer w = new OutputStreamWriter(new FileOutputStream(new File(dir, "labels.tsv")), "UTF-8")) { w.write(labels.toString()); }
        try (Writer w = new OutputStreamWriter(new FileOutputStream(new File(dir, "index.tsv")), "UTF-8")) { w.write(index.toString()); }
    }
}
