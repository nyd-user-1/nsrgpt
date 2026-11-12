// Brief 77 step 4: run JANIS's own book generator (org.nea.janis.book.BarnBook, OFFICIAL options) against a local
// JANIS base. Same as `BarnBook <conn> XML,JNS <threads> OFFICIAL <letter>`, with these differences only:
//   - the connection is given as JANIS's own connection string, not looked up in JANIS's settings file;
//   - the Q-value table is off: it is drawn in the PDF book only, and needs a "Nubase 2020" dataset;
//   - step 10: with -Dextra="<library>=<#rrggbb>,..." the libraries JANIS has no package for are appended to JANIS's
//     official list (drawn first, since JANIS walks the list from its end), each with a 1 px line in the colour given;
//     JANIS's same rules (EXFOR still required) then make the pages, now with those libraries in them.
// Output goes where JANIS writes it: <user.dir>/<filesystem label>/... (XML pages, navigation, JNS pages).
//   java -cp "/opt/janis/*:." -Duser.dir=<out> [-Dextra=...] BookRun "<LOCAL:...>" <n|p|d|t|h|a|g> <threads> [material]
import java.awt.BasicStroke;
import java.awt.Color;
import java.util.EnumSet;
import org.nea.janis.book.BarnBook;
import org.nea.janis.book.BarnBookOptions;
import org.nea.janis.book.BarnBookOptionsOfficial;
import org.nea.janis.book.BarnBookOutputType;
import org.nea.janis.connection.JanisConnectionId;
import org.nea.janis.connection.JanisConnectionIdFactory;
import org.nea.janis.database.DataSetId;
import org.nea.janis.database.MaterialId;
import org.nea.janis.view.plot.ContinuousPlotProperty;

public class BookRun {
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
        if (args.length > 3) o.setSingleMaterial(MaterialId.decode(args[3]));
        new BarnBook(o).run();
        System.exit(0);
    }
}
