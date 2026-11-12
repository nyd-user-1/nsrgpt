// Brief 77 step 11: the upper levels of JANIS's own browse tree, listed by JANIS's code over JANIS's own bases
// (connection.getChildren, as `janis -list` and nsr-janis do): datatype > library > data type > material, with JANIS's
// labels, merged across the bases given, as one JSON file for the browse page. JANIS lists these levels with full scans of
// its index (13 to 76 s a call on a cold base), past the API gateway's 30 s, so they are listed once here; the levels under
// a material stay live (nsr-janis, about a second).
//   java -cp "/opt/janis/*:." TreeExport <out.json> <h2 path without .h2.db>...
import java.io.*;
import java.util.*;
import org.nea.janis.connection.HelloAnswer;
import org.nea.janis.connection.JanisConnectionId;
import org.nea.janis.connection.JanisConnectionIdFactory;
import org.nea.janis.connection.JanisReadConnection;
import org.nea.janis.connection.pool.JanisConnectionsPool;
import org.nea.janis.database.CategoryId;
import org.nea.janis.database.DataTypeId;
import org.nea.janis.db.AbsoluteRefs;
import org.nea.janis.db.JanisId;
import org.nea.janis.db.JanisIdSet;

public class TreeExport {
    // datatype code -> [label, dataset code -> [label, category code -> [label, material codes]]]
    static TreeMap<String, Object[]> tree = new TreeMap<>();
    static Map<String, Integer> order = new HashMap<>();

    public static void main(String[] args) throws Exception {
        org.nea.janis.book.BarnBook.settingsInitialization();
        for (int i = 1; i < args.length; i++) {
            String path = args[i];
            String label = new File(path).getName();
            JanisConnectionId id = JanisConnectionIdFactory.buildFromString("LOCAL:label=" + label + "|root=/tmp/none|url=jdbc:h2:" + path
                    + ";ACCESS_MODE_DATA=r;FILE_LOCK=NO;TRACE_LEVEL_FILE=0|user=janis|password=janis");
            JanisConnectionsPool.add(id, true, false);
            JanisReadConnection c = JanisConnectionsPool.getInstance().getConnection(id);
            HelloAnswer h = c.hello();
            DataTypeId.register(h.getDatatypeIds());
            CategoryId.register(h.getCategoryIds());
            AbsoluteRefs root = new AbsoluteRefs(id);
            for (JanisId dt : sorted(c.getChildren(root))) {
                AbsoluteRefs rDt = new AbsoluteRefs(root, dt);
                Object[] nDt = tree.computeIfAbsent(dt.code(), k -> new Object[]{String.valueOf(dt), new TreeMap<String, Object[]>()});
                @SuppressWarnings("unchecked") TreeMap<String, Object[]> dss = (TreeMap<String, Object[]>) nDt[1];
                for (JanisId ds : sorted(c.getChildren(rDt))) {
                    AbsoluteRefs rDs = new AbsoluteRefs(rDt, ds);
                    Object[] nDs = dss.computeIfAbsent(ds.code(), k -> new Object[]{String.valueOf(ds), new TreeMap<String, Object[]>()});
                    @SuppressWarnings("unchecked") TreeMap<String, Object[]> cats = (TreeMap<String, Object[]>) nDs[1];
                    for (JanisId cat : sorted(c.getChildren(rDs))) {
                        AbsoluteRefs rCat = new AbsoluteRefs(rDs, cat);
                        Object[] nCat = cats.computeIfAbsent(cat.code(), k -> new Object[]{String.valueOf(cat), new ArrayList<String[]>()});
                        @SuppressWarnings("unchecked") List<String[]> mats = (List<String[]>) nCat[1];
                        for (JanisId mat : sorted(c.getChildren(rCat))) mats.add(new String[]{mat.code(), String.valueOf(mat)});
                        System.out.println(label + " " + dt.code() + " " + ds.code() + " " + cat.code() + " " + mats.size());
                    }
                }
            }
        }
        StringBuilder b = new StringBuilder("{");
        boolean f1 = true;
        for (Map.Entry<String, Object[]> e1 : tree.entrySet()) {
            if (!f1) b.append(',');
            f1 = false;
            b.append(q(e1.getKey())).append(":{\"label\":").append(q((String) e1.getValue()[0])).append(",\"children\":{");
            boolean f2 = true;
            @SuppressWarnings("unchecked") TreeMap<String, Object[]> dss = (TreeMap<String, Object[]>) e1.getValue()[1];
            for (Map.Entry<String, Object[]> e2 : dss.entrySet()) {
                if (!f2) b.append(',');
                f2 = false;
                b.append(q(e2.getKey())).append(":{\"label\":").append(q((String) e2.getValue()[0])).append(",\"children\":{");
                boolean f3 = true;
                @SuppressWarnings("unchecked") TreeMap<String, Object[]> cats = (TreeMap<String, Object[]>) e2.getValue()[1];
                for (Map.Entry<String, Object[]> e3 : cats.entrySet()) {
                    if (!f3) b.append(',');
                    f3 = false;
                    b.append(q(e3.getKey())).append(":{\"label\":").append(q((String) e3.getValue()[0])).append(",\"materials\":[");
                    boolean f4 = true;
                    @SuppressWarnings("unchecked") List<String[]> mats = (List<String[]>) e3.getValue()[1];
                    for (String[] m : mats) {
                        if (!f4) b.append(',');
                        f4 = false;
                        b.append('[').append(q(m[0])).append(',').append(q(m[1])).append(']');
                    }
                    b.append("]}");
                }
                b.append("}}");
            }
            b.append("}}");
        }
        b.append('}');
        try (Writer w = new OutputStreamWriter(new FileOutputStream(args[0]), "UTF-8")) { w.write(b.toString()); }
        System.exit(0);
    }

    @SuppressWarnings("unchecked")
    static List<JanisId> sorted(JanisIdSet s) {
        List<JanisId> l = new ArrayList<>();
        if (s != null) for (Object o : s) l.add((JanisId) o);
        Collections.sort(l);
        return l;
    }

    static String q(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char ch : s.toCharArray()) {
            if (ch == '"' || ch == '\\') b.append('\\').append(ch);
            else if (ch < 0x20) b.append(String.format("\\u%04x", (int) ch));
            else b.append(ch);
        }
        return b.append('"').toString();
    }
}
