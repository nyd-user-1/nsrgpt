// nsr-janis: one S3 object to a local file with parallel ranged GETs signed with AWS Signature Version 4 from the Lambda's
// own credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN), so the image needs no AWS SDK.
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public class S3Get {
    static final String BUCKET = System.getenv().getOrDefault("JANIS_BUCKET", "nsr-lake-613473203863");
    static final String REGION = System.getenv().getOrDefault("AWS_REGION", "us-east-2");
    static final String HOST = BUCKET + ".s3." + REGION + ".amazonaws.com";
    static final long PART = 32L << 20;

    public static void download(String key, Path to, int threads) throws Exception {
        long size = Long.parseLong(request("HEAD", key, null).getHeaderField("Content-Length"));
        Path tmp = to.resolveSibling(to.getFileName() + ".part");
        try (RandomAccessFile f = new RandomAccessFile(tmp.toFile(), "rw")) { f.setLength(size); }
        ExecutorService ex = Executors.newFixedThreadPool(threads);
        List<Future<?>> fs = new ArrayList<>();
        for (long off = 0; off < size; off += PART) {
            final long a = off, b = Math.min(size, off + PART) - 1;
            fs.add(ex.submit(() -> {
                HttpURLConnection c = request("GET", key, "bytes=" + a + "-" + b);
                try (InputStream in = new BufferedInputStream(c.getInputStream(), 1 << 20); RandomAccessFile f = new RandomAccessFile(tmp.toFile(), "rw")) {
                    f.seek(a);
                    byte[] buf = new byte[1 << 20];
                    int n;
                    while ((n = in.read(buf)) > 0) f.write(buf, 0, n);
                }
                return null;
            }));
        }
        for (Future<?> x : fs) x.get();
        ex.shutdown();
        Files.move(tmp, to, StandardCopyOption.REPLACE_EXISTING);
    }

    static HttpURLConnection request(String method, String key, String range) throws Exception {
        SimpleDateFormat df = new SimpleDateFormat("yyyyMMdd'T'HHmmss'Z'");
        df.setTimeZone(TimeZone.getTimeZone("UTC"));
        String amzDate = df.format(new Date()), date = amzDate.substring(0, 8);
        String path = "/" + key.replace(" ", "%20");
        String token = System.getenv("AWS_SESSION_TOKEN");
        TreeMap<String, String> h = new TreeMap<>();
        h.put("host", HOST);
        h.put("x-amz-content-sha256", "UNSIGNED-PAYLOAD");
        h.put("x-amz-date", amzDate);
        if (token != null) h.put("x-amz-security-token", token);
        if (range != null) h.put("range", range);
        StringBuilder canonH = new StringBuilder();
        for (Map.Entry<String, String> e : h.entrySet()) canonH.append(e.getKey()).append(':').append(e.getValue().trim()).append('\n');
        String signed = String.join(";", h.keySet());
        String canon = method + "\n" + path + "\n\n" + canonH + "\n" + signed + "\nUNSIGNED-PAYLOAD";
        String scope = date + "/" + REGION + "/s3/aws4_request";
        String toSign = "AWS4-HMAC-SHA256\n" + amzDate + "\n" + scope + "\n" + hex(sha256(canon.getBytes(StandardCharsets.UTF_8)));
        byte[] k = hmac(("AWS4" + System.getenv("AWS_SECRET_ACCESS_KEY")).getBytes(StandardCharsets.UTF_8), date);
        k = hmac(k, REGION);
        k = hmac(k, "s3");
        k = hmac(k, "aws4_request");
        String sig = hex(hmac(k, toSign));
        HttpURLConnection c = (HttpURLConnection) new URL("https://" + HOST + path).openConnection();
        c.setRequestMethod(method);
        for (Map.Entry<String, String> e : h.entrySet()) if (!e.getKey().equals("host")) c.setRequestProperty(e.getKey(), e.getValue());
        c.setRequestProperty("Authorization", "AWS4-HMAC-SHA256 Credential=" + System.getenv("AWS_ACCESS_KEY_ID") + "/" + scope
                + ", SignedHeaders=" + signed + ", Signature=" + sig);
        c.setConnectTimeout(10000);
        c.setReadTimeout(60000);
        int code = c.getResponseCode();
        if (code >= 300) throw new IOException("S3 " + method + " " + key + " answered " + code);
        return c;
    }

    static byte[] sha256(byte[] b) throws Exception { return MessageDigest.getInstance("SHA-256").digest(b); }

    static byte[] hmac(byte[] key, String s) throws Exception {
        Mac m = Mac.getInstance("HmacSHA256");
        m.init(new SecretKeySpec(key, "HmacSHA256"));
        return m.doFinal(s.getBytes(StandardCharsets.UTF_8));
    }

    static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }
}
