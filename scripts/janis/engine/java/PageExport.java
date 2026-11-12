// Brief 77 step 5: for every JNS page JANIS's book generator wrote, restore it with JANIS's own loader (as
// `janis -render` does) and export each plotted series with JANIS's own Tabler on its data's own X values (as
// `janis -table` does): <out>/<page>/<i>.csv, one per series in JANIS's drawing order, and <out>/<page>/index.tsv
// (i, refs code string, producer class, rows). The numbers are JANIS's; this file only calls its classes.
//   java -cp "/opt/janis/*:." PageExport "<LOCAL:...>" <jns dir> <out dir> [shard i/n]
import com.thoughtworks.xstream.XStream;
import java.io.*;
import java.util.*;
import org.nea.janis.connection.JanisConnectionId;
import org.nea.janis.connection.JanisConnectionIdFactory;
import org.nea.janis.connection.pool.JanisConnectionsPool;
import org.nea.janis.connection.pool.JanisReadConnections;
import org.nea.janis.connection.pool.JanisReadWriteConnections;
import org.nea.janis.connection.pool.JanisWritableConnectionsPool;
import org.nea.janis.db.AbsoluteRefs;
import org.nea.janis.filters.ExportParametersTableCSV;
import org.nea.janis.filters.ExportTypeCSV;
import org.nea.janis.ui.renderer.RendererState;
import org.nea.janis.ui.renderer.RendererStateXStreamHelper;
import org.nea.janis.ui.viewer.plotter.PlotterState;
import org.nea.janis.ui.viewer.tabler.TablerState;
import org.nea.janis.view.table.TableProducer;
import org.nea.janis.xml.JANISXStreamConfig;
import org.nea.janis.xml.JanisXMLContext;

public class PageExport {
    public static void main(String[] args) throws Exception {
        org.nea.janis.book.BarnBook.settingsInitialization();
        JanisConnectionId connId = JanisConnectionIdFactory.buildFromString(args[0]);
        JanisConnectionsPool.add(connId, true, false);
        JanisConnectionsPool.getInstance().waitForConnections();
        JanisReadWriteConnections rw = new JanisWritableConnectionsPool((JanisReadConnections) JanisConnectionsPool.getInstance());
        File in = new File(args[1]), out = new File(args[2]);
        int shard = 0, shards = 1;
        if (args.length > 3) { String[] s = args[3].split("/"); shard = Integer.parseInt(s[0]); shards = Integer.parseInt(s[1]); }
        File[] files = in.listFiles((d, n) -> n.endsWith(".jns"));
        Arrays.sort(files);
        int done = 0, failed = 0;
        for (int k = 0; k < files.length; k++) {
            if (k % shards != shard) continue;
            File f = files[k];
            File dir = new File(out, f.getName().replaceAll("\\.jns$", ""));
            if (new File(dir, "index.tsv").exists()) continue;
            try {
                exportPage(f, dir, rw);
                done++;
            } catch (Throwable t) {
                failed++;
                System.err.println("FAILED " + f.getName() + " : " + t);
                t.printStackTrace(System.err);
            }
            if ((done + failed) % 50 == 0) System.out.println("progress done=" + done + " failed=" + failed);
        }
        System.out.println("END done=" + done + " failed=" + failed);
        System.exit(0);
    }

    static void exportPage(File jns, File dir, JanisReadWriteConnections rw) throws Exception {
        XStream xstream = JANISXStreamConfig.buildXStream();
        JanisXMLContext ctx = new JanisXMLContext();
        RendererState state;
        try (InputStream is = new FileInputStream(jns)) {
            state = (RendererState) RendererStateXStreamHelper.unmarshal(xstream, is, ctx, rw);
        }
        if (state == null) throw new IllegalStateException("not restored");
        dir.mkdirs();
        try (PrintWriter w = new PrintWriter(new File(dir, "warnings.txt"), "UTF-8")) {
            for (String m : ctx.getErrors()) w.println("error\t" + m);
            for (String m : ctx.getWarnings()) w.println("warning\t" + m);
        }
        PlotterState ps = (PlotterState) state.getViewerState("p0");
        Map<AbsoluteRefs, ?> producers = ps.getDisplayedProducers();
        StringBuilder index = new StringBuilder();
        int i = 0;
        for (AbsoluteRefs refs : ps.getPlotProducersRefsOrder()) {
            Object p = producers.get(refs);
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
            // An EXFOR set: JANIS's own first author and reference year (the legend's source, kept here even where the
            // page has more than 20 sets and JANIS leaves the legend empty), and its point count.
            String x4 = "";
            if (p instanceof org.nea.janis.format.exfor.data.EXFOR_DataPT) {
                org.nea.janis.format.exfor.data.EXFOR_DataPT d = (org.nea.janis.format.exfor.data.EXFOR_DataPT) p;
                org.nea.tools.PairNulls<String, Integer> fa = d.getFirstAuthorReferenceYear();
                x4 = (fa.getLeft() == null ? "" : fa.getLeft()) + "\t" + (fa.getRight() == null ? "" : fa.getRight()) + "\t" + d.getNbPoints();
            }
            index.append(i).append('\t').append(refs.toCodeString()).append('\t').append(cls).append('\t').append(rows).append('\t').append(x4).append('\n');
            i++;
        }
        // The selection tree's labels: each level's id as JANIS names it (dataset, category, material, datablock, data...),
        // in JANIS's own order of refs (AbsoluteRefs' compareTo, as its sorted tree uses).
        TreeSet<AbsoluteRefs> sorted = new TreeSet<>(ps.getPlotProducersRefsOrder());
        StringBuilder labels = new StringBuilder();
        for (AbsoluteRefs refs : sorted) {
            labels.append(refs.toCodeString());
            labels.append('\t').append(refs.getDatasetId()).append('\t').append(refs.getCategoryId()).append('\t').append(refs.getMaterialId().toShortString()).append('\t').append(refs.getDatablockId());
            for (org.nea.janis.data.DataId d : refs.getDataIds()) if (d != null) labels.append('\t').append(d);
            labels.append('\n');
        }
        try (Writer w = new OutputStreamWriter(new FileOutputStream(new File(dir, "labels.tsv")), "UTF-8")) { w.write(labels.toString()); }
        try (Writer w = new OutputStreamWriter(new FileOutputStream(new File(dir, "index.tsv")), "UTF-8")) { w.write(index.toString()); }
    }
}
