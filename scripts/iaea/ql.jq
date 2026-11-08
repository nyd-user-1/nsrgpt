def isdata: (split("/") | .[-1]) as $f | ($f | test("\\.(html?|htmlx|js|css|png|gif|jpg|jpeg|ico|svg)$"; "i") | not) and ($f != "") and ($f | test("rendered"; "i") | not);
def isdatax: isdata and ((split("/") | .[-1]) | test("\\.[A-Za-z0-9]{1,6}$"));
($keys[0]) as $all
| [split("\n")[1:] | map(select(length > 0) | split("\t")) | .[]
   | . as [$name, $url, $class, $paths, $note]
   | ($paths | split(" ") | map(select(length > 0))) as $pp
   | ([$all[] | select(.k as $k | $pp | any(. as $p | $k | startswith("raw/" + $p))) | select(.k | isdata)]) as $hit
   | ($hit | map(select(.k | isdatax)) | length) as $strict
   | (if $class == "taken" then "taken"
      elif $class == "elsewhere" then "page only, data elsewhere"
      elif $class == "pending" then (if $strict > 0 then "taken" else "page only, data pending" end)
      elif $class == "held" then "held"
      elif $class == "listed" then "listed"
      else "not taken" end) as $st
   | (if ($pp | length) > 0 then ($pp | map("raw/" + .) | join(", ")) + ": " else "" end) as $where
   | {item: $name, url: $url, type: "Quick Link", status: $st,
      files: (if ($hit | length) > 0 and ($st | startswith("page only, data pending") | not) then ($hit | length) else null end),
      bytes: (if ($hit | length) > 0 and ($st | startswith("page only, data pending") | not) then ($hit | map(.b) | add) else null end),
      where: ($where + $note)}]
