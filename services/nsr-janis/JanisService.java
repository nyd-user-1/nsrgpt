// Brief 77 step 11: Lambda nsr-janis answers Elpis's browse and search with JANIS's own code over JANIS's own database
// index (the H2 bases JANIS's importer built from janis/data's packages on the engine boxes, baked into the container
// image under /opt/janis-db and copied to /tmp on a cold start, since H2 writes a lock file beside the base).
//   GET /janis/list?refs=<datatype> <dataset> <category> <material> <datablock>...   (any prefix; empty = the datatypes)
//       the node's children as JANIS lists them (`janis -list`: connection.getChildren, sorted), from every base that
//       holds the node: [{code, label, short}]
//   GET /janis/search?type=<endf|exfor|cinda|resonances|decay|covariances>&p=<key=value>&p=...
//       JANIS's search (`janis -search`: CommandLineParserSearchParameters, connection.search) in every base that has it:
//       {columns, rows, refs, total, bases}; rows as JANIS's table export writes them (ExportTypeCSV), refs the result's
//       JANIS references where the result carries them (what the page plots)
// No JSON library: the API Gateway event is read with two regular expressions.
import java.io.*;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import org.nea.janis.app.commandline.CommandLineParserSearchParameters;
import org.nea.janis.connection.HelloAnswer;
import org.nea.janis.connection.JanisConnectionId;
import org.nea.janis.connection.JanisConnectionIdFactory;
import org.nea.janis.connection.JanisReadConnection;
import org.nea.janis.database.CategoryId;
import org.nea.janis.database.DataTypeId;
import org.nea.janis.database.search.SearchParameters;
import org.nea.janis.database.search.SearchResult;
import org.nea.janis.database.search.SearchResults;
import org.nea.janis.database.search.SearchType;
import org.nea.janis.db.AbsoluteRefs;
import org.nea.janis.db.JanisId;
import org.nea.janis.db.JanisIdSet;
import org.nea.janis.db.RefsParser;
import org.nea.janis.db.RelativesRefs;
import org.nea.janis.filters.ExportParametersTableCSV;
import org.nea.janis.filters.ExportTypeCSV;

public class JanisService {
    static final int MAX_ROWS = 5000;
    static Map<String, JanisReadConnection> conns;

    static synchronized void init() throws Exception {
        if (conns != null) return;
        org.nea.janis.book.BarnBook.settingsInitialization();
        Path src = Paths.get(System.getenv().getOrDefault("JANIS_DB", "/opt/janis-db"));
        Files.createDirectories(Paths.get("/tmp/janis-datapack"));
        Map<String, JanisReadConnection> m = new LinkedHashMap<>();
        try (DirectoryStream<Path> ds = Files.newDirectoryStream(src, "*.h2.db")) {
            List<Path> files = new ArrayList<>();
            for (Path p : ds) files.add(p);
            Collections.sort(files);
            for (Path p : files) {
                String label = p.getFileName().toString().replace(".h2.db", "");
                // read-only in place: the image is read-only, and copying 1 GB out of it outran the gateway's 30 s
                JanisConnectionId id = JanisConnectionIdFactory.buildFromString("LOCAL:label=" + label + "|root=/tmp/janis-datapack|url=jdbc:h2:"
                        + src.resolve(label) + ";ACCESS_MODE_DATA=r;FILE_LOCK=NO;TRACE_LEVEL_FILE=0|user=janis|password=janis");
                org.nea.janis.connection.pool.JanisConnectionsPool.add(id, true, false);
                JanisReadConnection c = org.nea.janis.connection.pool.JanisConnectionsPool.getInstance().getConnection(id);
                HelloAnswer h = c.hello();
                DataTypeId.register(h.getDatatypeIds());
                CategoryId.register(h.getCategoryIds());
                m.put(label, c);
            }
        }
        conns = m;
    }

    public void handleRequest(InputStream in, OutputStream out) throws IOException {
        String ev = new String(readAll(in), StandardCharsets.UTF_8);
        String path = str(ev, "rawPath");
        String qs = str(ev, "rawQueryString");
        Map<String, List<String>> q = query(qs == null ? "" : qs);
        int status = 200;
        String body;
        try {
            init();
            if (path != null && path.endsWith("/janis/list")) body = list(first(q, "refs"));
            else if (path != null && path.endsWith("/janis/search")) body = search(first(q, "type"), q.getOrDefault("p", Collections.emptyList()));
            else { status = 404; body = "{\"error\":\"routes: /janis/list?refs=, /janis/search?type=&p=\"}"; }
        } catch (Throwable t) {
            status = 400;
            body = "{\"error\":" + q(String.valueOf(t.getMessage() == null ? t.toString() : t.getMessage())) + "}";
        }
        String resp = "{\"statusCode\":" + status + ",\"headers\":{\"content-type\":\"application/json\",\"access-control-allow-origin\":\"*\",\"cache-control\":\"public, max-age=300\"},\"body\":" + q(body) + "}";
        out.write(resp.getBytes(StandardCharsets.UTF_8));
    }

    static String list(String refs) throws Exception {
        TreeMap<JanisId, String[]> kids = new TreeMap<>();
        List<String> hit = new ArrayList<>(), errors = new ArrayList<>();
        for (Map.Entry<String, JanisReadConnection> e : conns.entrySet()) {
            List<String> tokens = new ArrayList<>();
            tokens.add(e.getKey());
            if (refs != null && !refs.trim().isEmpty()) tokens.addAll(tokenize(refs));
            AbsoluteRefs r;
            try {
                r = new AbsoluteRefs(RefsParser.parseRelativesRefsSet(tokens.iterator()).getSimpleRefs());
            } catch (Exception ex) {
                errors.add(e.getKey() + ": " + ex);
                continue;
            }
            JanisIdSet set;
            try {
                set = e.getValue().getChildren(r);
            } catch (Exception ex) {
                errors.add(e.getKey() + ": " + ex);
                continue;
            }
            if (set == null || set.isEmpty()) continue;
            hit.add(e.getKey());
            for (Object o : set) {
                JanisId id = (JanisId) o;
                kids.putIfAbsent(id, new String[]{id.code(), String.valueOf(id), id.toShortString()});
            }
        }
        StringBuilder b = new StringBuilder("{\"bases\":").append(arr(hit)).append(",\"errors\":").append(arr(errors)).append(",\"children\":[");
        boolean f = true;
        for (String[] k : kids.values()) {
            if (!f) b.append(',');
            f = false;
            b.append("{\"code\":").append(q(k[0])).append(",\"label\":").append(q(k[1])).append(",\"short\":").append(q(k[2])).append('}');
        }
        return b.append("]}").toString();
    }

    static String search(String type, List<String> params) throws Exception {
        SearchType st = null;
        for (SearchType s : SearchType.values()) if (s.getCodeString().equalsIgnoreCase(type)) st = s;
        if (st == null) throw new IllegalArgumentException("unknown search type " + type);
        List<String> header = null;
        List<String> rows = new ArrayList<>(), refs = new ArrayList<>(), bases = new ArrayList<>();
        int total = 0;
        for (Map.Entry<String, JanisReadConnection> e : conns.entrySet()) {
            JanisReadConnection c = e.getValue();
            if (!c.isSearchPresent(st)) continue;
            SearchParameters sp = CommandLineParserSearchParameters.parseSearchParameters(st, params.iterator());
            // the table JANIS's search export writes
            SearchResults res = c.search(sp);
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            ExportParametersTableCSV p = new ExportParametersTableCSV();
            p.setOutputStream(buf);
            p.setHeadersSaved(true);
            p.setKeepUnits(true);
            p.setSeparator("\t");
            ExportTypeCSV.getInstance().export(res, p);
            res.close();
            String[] lines = buf.toString("UTF-8").split("\r?\n");
            if (lines.length == 0 || lines[0].isEmpty()) continue;
            bases.add(e.getKey());
            if (header == null) header = Arrays.asList(lines[0].split("\t", -1));
            for (int i = 1; i < lines.length; i++) {
                if (lines[i].isEmpty()) continue;
                total++;
                if (rows.size() < MAX_ROWS) rows.add(arr(Arrays.asList(lines[i].split("\t", -1))));
            }
            // the same search again for each result's JANIS reference, where its result carries one
            SearchResults again = c.search(CommandLineParserSearchParameters.parseSearchParameters(st, params.iterator()));
            while (again.hasNext() && refs.size() < MAX_ROWS) {
                SearchResult r = (SearchResult) again.next();
                String code = "";
                try {
                    RelativesRefs rr = (RelativesRefs) r.getClass().getMethod("getRelativesRefs").invoke(r);
                    if (rr != null) code = rr.toCodeString();
                } catch (Exception ignored) { }
                refs.add(q(code));
            }
            again.close();
        }
        return "{\"type\":" + q(st.getCodeString()) + ",\"bases\":" + arr(bases) + ",\"total\":" + total + ",\"columns\":"
                + (header == null ? "[]" : arr(header)) + ",\"rows\":[" + String.join(",", rows) + "],\"refs\":[" + String.join(",", refs) + "]}";
    }

    static List<String> tokenize(String s) {
        List<String> t = new ArrayList<>();
        Matcher m = Pattern.compile("\"([^\"]*)\"|(\\S+)").matcher(s);
        while (m.find()) t.add(m.group(1) != null ? m.group(1) : m.group(2));
        return t;
    }

    static Map<String, List<String>> query(String qs) throws UnsupportedEncodingException {
        Map<String, List<String>> m = new HashMap<>();
        for (String kv : qs.split("&")) {
            if (kv.isEmpty()) continue;
            int i = kv.indexOf('=');
            String k = URLDecoder.decode(i < 0 ? kv : kv.substring(0, i), "UTF-8");
            String v = i < 0 ? "" : URLDecoder.decode(kv.substring(i + 1), "UTF-8");
            m.computeIfAbsent(k, x -> new ArrayList<>()).add(v);
        }
        return m;
    }

    static String first(Map<String, List<String>> q, String k) {
        List<String> v = q.get(k);
        return v == null || v.isEmpty() ? null : v.get(0);
    }

    /** A string field of the event, by a plain scan (a regex with an alternation in a repeat recurses per character). */
    static String str(String json, String key) {
        Matcher m = Pattern.compile("\"" + Pattern.quote(key) + "\"\\s*:\\s*\"").matcher(json);
        if (!m.find()) return null;
        StringBuilder b = new StringBuilder();
        for (int i = m.end(); i < json.length(); i++) {
            char ch = json.charAt(i);
            if (ch == '"') break;
            if (ch == '\\' && i + 1 < json.length()) {
                char n = json.charAt(++i);
                if (n == 'u' && i + 4 < json.length()) { b.append((char) Integer.parseInt(json.substring(i + 1, i + 5), 16)); i += 4; }
                else b.append(n);
            } else b.append(ch);
        }
        return b.toString();
    }

    static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
        return o.toByteArray();
    }

    static String arr(List<String> l) {
        StringBuilder b = new StringBuilder("[");
        for (int i = 0; i < l.size(); i++) {
            if (i > 0) b.append(',');
            b.append(q(l.get(i)));
        }
        return b.append(']').toString();
    }

    static String q(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char ch : s.toCharArray()) {
            if (ch == '"' || ch == '\\') b.append('\\').append(ch);
            else if (ch == '\n') b.append("\\n");
            else if (ch == '\r') b.append("\\r");
            else if (ch == '\t') b.append("\\t");
            else if (ch < 0x20) b.append(String.format("\\u%04x", (int) ch));
            else b.append(ch);
        }
        return b.append('"').toString();
    }
}
