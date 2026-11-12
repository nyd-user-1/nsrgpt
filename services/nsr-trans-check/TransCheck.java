// Brief 77 step 12: Lambda nsr-trans-check runs JANIS's own EXFOR TRANS checker (NEA's janis-trans-checker.jar,
// org.nea.janis.trans.TRANSCheckerCommandLine, as `java -jar janis-trans-checker.jar <file>`), so /elpis/checker shows
// JANIS's output. nsr-api's POST /exfor/check puts the file in the lake, presigns a GET and invokes this with
// {"url": "<presigned GET>", "name": "<file name>"}; the answer is {"exit": n, "log": "<JANIS's XML log>", "stdout", "stderr",
// "seconds": s}. NEA's jars ride in the deployment package (lib/), fetched from lake/_raw/janis-software/ by deploy.sh;
// none of NEA's code is in this repository. No JSON library: the input has two string fields.
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;

public class TransCheck {
    public void handleRequest(InputStream in, OutputStream out) throws IOException {
        long t0 = System.currentTimeMillis();
        String body = new String(readAll(in), StandardCharsets.UTF_8);
        String url = field(body, "url");
        String name = field(body, "name");
        if (name == null || name.isEmpty()) name = "file";
        name = name.replaceAll("[^A-Za-z0-9._-]", "_");
        Path dir = Files.createTempDirectory("trans");
        Path file = dir.resolve(name);
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10000);
        c.setReadTimeout(60000);
        try (InputStream s = c.getInputStream()) { Files.copy(s, file); }
        String java = Paths.get(System.getProperty("java.home"), "bin", "java").toString();
        String task = System.getenv().getOrDefault("LAMBDA_TASK_ROOT", ".");
        // `<IN> <OUT>`: JANIS writes its XML log to <OUT>.xml (its default stylesheet importlog_seq.xsl beside it)
        Path log = dir.resolve("log");
        ProcessBuilder pb = new ProcessBuilder(java, "-Xmx1g", "-Xss16m", "-Duser.home=" + dir, "-cp", task + "/lib/*",
                "org.nea.janis.trans.TRANSCheckerCommandLine", file.toString(), log.toString());
        pb.directory(dir.toFile());
        Process p = pb.start();
        ByteArrayOutputStream so = new ByteArrayOutputStream(), se = new ByteArrayOutputStream();
        Thread a = pump(p.getInputStream(), so), b = pump(p.getErrorStream(), se);
        int exit;
        try { exit = p.waitFor(); a.join(); b.join(); } catch (InterruptedException e) { exit = -1; }
        Path xml = dir.resolve("log.xml");
        String logText = Files.exists(xml) ? new String(Files.readAllBytes(xml), StandardCharsets.ISO_8859_1) : "";
        String json = "{\"exit\":" + exit + ",\"log\":" + q(logText) + ",\"stdout\":" + q(so.toString("UTF-8")) + ",\"stderr\":" + q(se.toString("UTF-8"))
                + ",\"name\":" + q(name) + ",\"seconds\":" + ((System.currentTimeMillis() - t0) / 1000.0) + "}";
        out.write(json.getBytes(StandardCharsets.UTF_8));
    }

    static Thread pump(InputStream s, ByteArrayOutputStream o) {
        Thread t = new Thread(() -> { try { byte[] buf = new byte[65536]; int n; while ((n = s.read(buf)) > 0) o.write(buf, 0, n); } catch (IOException ignored) { } });
        t.start();
        return t;
    }

    static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
        return o.toByteArray();
    }

    /** A string field of a flat JSON object, with \" \\ \/ and \\uXXXX unescaped. A plain scan: a regular expression with
     *  an alternation inside a repeat recurses once per character and overflows the stack on a long presigned URL. */
    static String field(String json, String key) {
        Matcher m = Pattern.compile("\"" + Pattern.quote(key) + "\"\\s*:\\s*\"").matcher(json);
        if (!m.find()) return null;
        StringBuilder b = new StringBuilder();
        for (int i = m.end(); i < json.length(); i++) {
            char ch = json.charAt(i);
            if (ch == '"') return b.toString();
            if (ch == '\\' && i + 1 < json.length()) {
                char n = json.charAt(++i);
                if (n == 'u' && i + 4 < json.length()) { b.append((char) Integer.parseInt(json.substring(i + 1, i + 5), 16)); i += 4; }
                else if (n == 'n') b.append('\n');
                else if (n == 't') b.append('\t');
                else b.append(n);
            } else b.append(ch);
        }
        return b.toString();
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
