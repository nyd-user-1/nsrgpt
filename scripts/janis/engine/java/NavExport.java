// Brief 77 step 9: the book's rails as JANIS builds them. Loads the navigation file JANIS's book generator wrote
// (book-<label>-navig.xml, BarnBookXMLPersistence) and writes JANIS's own outline (BarnBookItemNavigator.buildOutline:
// "By nuclide" element > nuclide > MT, and "By MT") as JSON: {label, page, mat, reac, children}.
//   java -cp "/opt/janis/*:." NavExport <book dir> <filesystem label> <out.json>
import java.io.*;
import org.nea.janis.book.BarnBookItemNavigator;
import org.nea.janis.book.BarnBookOutlineAbstractNode;
import org.nea.janis.book.BarnBookOutlineNode;
import org.nea.janis.book.xml.BarnBookXMLPersistence;

public class NavExport {
    public static void main(String[] args) throws Exception {
        org.nea.janis.book.BarnBook.settingsInitialization();
        BarnBookItemNavigator nav = new BarnBookXMLPersistence(new File(args[0])).loadNavigation(args[1]);
        StringBuilder sb = new StringBuilder();
        write(sb, nav.buildOutline());
        try (Writer w = new OutputStreamWriter(new FileOutputStream(args[2]), "UTF-8")) { w.write(sb.toString()); }
        System.out.println("pages " + nav.getKeys().size());
        System.exit(0);
    }

    static void write(StringBuilder sb, BarnBookOutlineAbstractNode n) {
        sb.append("{\"label\":").append(q(n.getLabel())).append(",\"page\":").append(n.getPage())
          .append(",\"mat\":").append(q(n.getMatIdStr())).append(",\"reac\":").append(q(n.getReacIdStr()));
        if (n instanceof BarnBookOutlineNode) {
            sb.append(",\"children\":[");
            boolean first = true;
            for (BarnBookOutlineAbstractNode k : ((BarnBookOutlineNode) n).getChildren()) {
                if (!first) sb.append(',');
                first = false;
                write(sb, k);
            }
            sb.append(']');
        }
        sb.append('}');
    }

    static String q(String s) {
        if (s == null) return "null";
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }
}
