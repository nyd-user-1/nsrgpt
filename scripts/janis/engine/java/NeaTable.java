// Brief 77 step 15: JANIS's own Tabler numbers from NEA's server, the data JANIS Web shows. JANIS's factory connection
// (basespool.url.1 = HTTP:label=NEA|url=http://www.oecd-nea.org/) is registered in JANIS's pool, and each ref given is
// exported with JANIS's Tabler on the data's own X values, as `janis -table` does: <out>/<i>.csv, and <out>/index.tsv.
//   java -cp "/opt/janis/*:." NeaTable <out dir> <refs file: one "~N~ENDF/B-VIII.0~SIG~Fe56~MT102~xs" a line>
import java.io.*;
import java.nio.file.*;
import java.util.*;
import org.nea.janis.connection.JanisConnectionId;
import org.nea.janis.connection.JanisConnectionIdFactory;
import org.nea.janis.connection.JanisReadConnection;
import org.nea.janis.connection.pool.JanisConnectionsPool;
import org.nea.janis.db.AbsoluteRefs;
import org.nea.janis.db.JanisNode;
import org.nea.janis.db.RefsParser;
import org.nea.janis.filters.ExportParametersTableCSV;
import org.nea.janis.filters.ExportTypeCSV;
import org.nea.janis.ui.viewer.tabler.TablerState;
import org.nea.janis.view.table.TableProducer;

public class NeaTable {
    public static void main(String[] args) throws Exception {
        org.nea.janis.book.BarnBook.settingsInitialization();
        // a third argument: another JANIS connection (a local base) in place of NEA's, for a side-by-side
        JanisConnectionId id = JanisConnectionIdFactory.buildFromString(args.length > 2 ? args[2] : "HTTP:label=NEA|url=http://www.oecd-nea.org/");
        String conn = args.length > 2 ? id.getLabel() : "NEA";
        JanisConnectionsPool.add(id, true, false);
        JanisConnectionsPool.getInstance().waitForConnections();
        JanisReadConnection c = JanisConnectionsPool.getInstance().getConnection(id);
        File out = new File(args[0]);
        out.mkdirs();
        List<String> refs = Files.readAllLines(Paths.get(args[1]));
        StringBuilder index = new StringBuilder();
        int i = 0;
        for (String r : refs) {
            r = r.trim();
            if (r.isEmpty()) continue;
            String status;
            try {
                List<String> tokens = new ArrayList<>();
                tokens.add(conn);
                for (String t : r.replaceFirst("^~", "").split("~")) tokens.add(t);
                AbsoluteRefs a = new AbsoluteRefs(RefsParser.parseRelativesRefsSet(tokens.iterator()).getSimpleRefs());
                JanisNode node = c.getJanisNode(a);
                if (!(node instanceof TableProducer)) throw new IllegalStateException("not a table producer: " + (node == null ? null : node.getClass()));
                TablerState ts = new TablerState();
                ts.addTableProducer(a, (TableProducer) node);
                ts.setUseXValuesFromData(true);
                try (OutputStream os = new BufferedOutputStream(new FileOutputStream(new File(out, i + ".csv")))) {
                    ExportParametersTableCSV p = new ExportParametersTableCSV();
                    p.setOutputStream(os);
                    p.setHeadersSaved(true);
                    p.setKeepUnits(true);
                    p.setSeparator(";");
                    ExportTypeCSV.getInstance().export(ts, p);
                }
                status = "ok";
            } catch (Throwable t) {
                status = "error " + t.toString().replace('\t', ' ').replace('\n', ' ');
            }
            index.append(i).append('\t').append(r).append('\t').append(status).append('\n');
            System.out.println(i + " " + r + " " + status);
            i++;
        }
        Files.write(new File(out, "index.tsv").toPath(), index.toString().getBytes("UTF-8"));
        System.exit(0);
    }
}
