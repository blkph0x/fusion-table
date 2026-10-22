/** Shopping names for a chosen cut. Omitting a cut leaves the method's usual name unchanged. */

export type CutBreed = "ordinary" | "angus" | "wagyu";
export type CutForm = "fillet" | "steak" | "mince" | "bone-in" | "whole" | "offal" | "slow" | "slice";
export type CutGroup = "Everyday" | "Breed" | "Less common";

export interface MeatCut {
  id: string;
  mainId: "chicken" | "turkey" | "beef" | "lamb" | "pork";
  shoppingName: string;
  breed: CutBreed;
  form: CutForm;
  group: CutGroup;
  aliases: readonly string[];
  packetNote: string;
}

const PACKET = "Check the packet. This name does not confirm a breed or a marble grade.";

function cut(entry: Omit<MeatCut, "packetNote"> & { packetNote?: string }): MeatCut {
  return { ...entry, packetNote: entry.packetNote ?? PACKET };
}

export const MEAT_CUTS: readonly MeatCut[] = [
  cut({ id: "chicken-breast", mainId: "chicken", shoppingName: "Chicken breast fillets", breed: "ordinary", form: "fillet", group: "Everyday", aliases: ["chicken breast", "breast fillet"] }),
  cut({ id: "chicken-thigh-fillet", mainId: "chicken", shoppingName: "Chicken thigh fillets", breed: "ordinary", form: "fillet", group: "Everyday", aliases: ["chicken thigh", "thigh fillet", "boneless thigh"] }),
  cut({ id: "chicken-thigh-bone", mainId: "chicken", shoppingName: "Chicken thigh cutlets", breed: "ordinary", form: "bone-in", group: "Everyday", aliases: ["bone in thigh", "chicken thigh cutlet"] }),
  cut({ id: "chicken-drumstick", mainId: "chicken", shoppingName: "Chicken drumsticks", breed: "ordinary", form: "bone-in", group: "Everyday", aliases: ["drumstick", "chicken drumstick"] }),
  cut({ id: "chicken-wing", mainId: "chicken", shoppingName: "Chicken wings", breed: "ordinary", form: "bone-in", group: "Everyday", aliases: ["chicken wing", "wings"] }),
  cut({ id: "chicken-wingette", mainId: "chicken", shoppingName: "Chicken wingettes", breed: "ordinary", form: "bone-in", group: "Everyday", aliases: ["chicken wingette", "wing nibbles", "drumettes"] }),
  cut({ id: "chicken-strip", mainId: "chicken", shoppingName: "Chicken stir-fry strips", breed: "ordinary", form: "slice", group: "Everyday", aliases: ["chicken strips", "chicken stir fry"] }),
  cut({ id: "chicken-maryland", mainId: "chicken", shoppingName: "Chicken marylands", breed: "ordinary", form: "bone-in", group: "Everyday", aliases: ["maryland", "chicken maryland"] }),
  cut({ id: "chicken-tenderloin", mainId: "chicken", shoppingName: "Chicken tenderloins", breed: "ordinary", form: "fillet", group: "Everyday", aliases: ["chicken tender", "chicken tenderloin"] }),
  cut({ id: "chicken-mince", mainId: "chicken", shoppingName: "Chicken mince", breed: "ordinary", form: "mince", group: "Everyday", aliases: ["chicken mince", "ground chicken"] }),
  cut({ id: "chicken-whole", mainId: "chicken", shoppingName: "Whole chicken", breed: "ordinary", form: "whole", group: "Less common", aliases: ["whole chicken", "whole bird"] }),
  cut({ id: "chicken-spatchcock", mainId: "chicken", shoppingName: "Spatchcock chicken", breed: "ordinary", form: "whole", group: "Less common", aliases: ["spatchcock", "butterflied chicken"] }),
  cut({ id: "chicken-liver", mainId: "chicken", shoppingName: "Chicken livers", breed: "ordinary", form: "offal", group: "Less common", aliases: ["chicken liver", "livers"] }),
  cut({ id: "chicken-heart", mainId: "chicken", shoppingName: "Chicken hearts", breed: "ordinary", form: "offal", group: "Less common", aliases: ["chicken heart"] }),
  cut({ id: "chicken-gizzard", mainId: "chicken", shoppingName: "Chicken gizzards", breed: "ordinary", form: "offal", group: "Less common", aliases: ["chicken gizzard"] }),
  cut({ id: "chicken-frame", mainId: "chicken", shoppingName: "Chicken frames", breed: "ordinary", form: "slow", group: "Less common", aliases: ["chicken frame", "chicken carcass"] }),

  cut({ id: "turkey-breast", mainId: "turkey", shoppingName: "Turkey breast fillets", breed: "ordinary", form: "fillet", group: "Everyday", aliases: ["turkey breast"] }),
  cut({ id: "turkey-thigh", mainId: "turkey", shoppingName: "Turkey thigh fillets", breed: "ordinary", form: "fillet", group: "Everyday", aliases: ["turkey thigh"] }),
  cut({ id: "turkey-mince", mainId: "turkey", shoppingName: "Turkey mince", breed: "ordinary", form: "mince", group: "Everyday", aliases: ["turkey mince", "ground turkey"] }),
  cut({ id: "turkey-whole", mainId: "turkey", shoppingName: "Whole turkey", breed: "ordinary", form: "whole", group: "Less common", aliases: ["whole turkey"] }),

  cut({ id: "beef-rump", mainId: "beef", shoppingName: "Beef rump steaks", breed: "ordinary", form: "steak", group: "Everyday", aliases: ["beef rump", "rump steak"] }),
  cut({ id: "beef-scotch", mainId: "beef", shoppingName: "Beef scotch fillet", breed: "ordinary", form: "steak", group: "Everyday", aliases: ["scotch fillet", "rib eye", "ribeye", "cube roll"] }),
  cut({ id: "beef-sirloin", mainId: "beef", shoppingName: "Beef sirloin steaks", breed: "ordinary", form: "steak", group: "Everyday", aliases: ["sirloin", "porterhouse"] }),
  cut({ id: "beef-eye-fillet", mainId: "beef", shoppingName: "Beef eye fillet", breed: "ordinary", form: "steak", group: "Everyday", aliases: ["eye fillet", "beef tenderloin", "fillet steak"] }),
  cut({ id: "beef-mince", mainId: "beef", shoppingName: "Beef mince", breed: "ordinary", form: "mince", group: "Everyday", aliases: ["beef mince", "ground beef"] }),
  cut({ id: "beef-chuck", mainId: "beef", shoppingName: "Boneless beef chuck", breed: "ordinary", form: "slow", group: "Everyday", aliases: ["beef chuck", "chuck steak"] }),
  cut({ id: "beef-gravy", mainId: "beef", shoppingName: "Gravy beef", breed: "ordinary", form: "slow", group: "Everyday", aliases: ["gravy beef", "beef shin"] }),
  cut({ id: "beef-oyster", mainId: "beef", shoppingName: "Beef oyster blade", breed: "ordinary", form: "steak", group: "Everyday", aliases: ["oyster blade", "flat iron"] }),
  cut({ id: "beef-bolar", mainId: "beef", shoppingName: "Beef bolar blade", breed: "ordinary", form: "steak", group: "Everyday", aliases: ["bolar blade", "bolar"] }),
  cut({ id: "beef-silverside", mainId: "beef", shoppingName: "Beef silverside", breed: "ordinary", form: "slow", group: "Everyday", aliases: ["silverside"] }),
  cut({ id: "beef-topside", mainId: "beef", shoppingName: "Beef topside", breed: "ordinary", form: "steak", group: "Everyday", aliases: ["topside"] }),
  cut({ id: "beef-tbone", mainId: "beef", shoppingName: "Beef T-bone", breed: "ordinary", form: "steak", group: "Everyday", aliases: ["t-bone", "t bone", "tbone"] }),
  cut({ id: "beef-diced", mainId: "beef", shoppingName: "Diced beef", breed: "ordinary", form: "slow", group: "Everyday", aliases: ["beef cubes", "casserole steak"] }),
  cut({ id: "beef-sausage", mainId: "beef", shoppingName: "Beef sausages", breed: "ordinary", form: "slice", group: "Everyday", aliases: ["beef sausage"] }),
  cut({ id: "angus-rump", mainId: "beef", shoppingName: "Angus beef rump steaks", breed: "angus", form: "steak", group: "Breed", aliases: ["angus rump", "angus beef"] }),
  cut({ id: "angus-scotch", mainId: "beef", shoppingName: "Angus beef scotch fillet", breed: "angus", form: "steak", group: "Breed", aliases: ["angus scotch", "angus rib eye", "angus cube roll"] }),
  cut({ id: "angus-eye", mainId: "beef", shoppingName: "Angus beef eye fillet", breed: "angus", form: "steak", group: "Breed", aliases: ["angus eye fillet", "angus tenderloin"] }),
  cut({ id: "angus-mince", mainId: "beef", shoppingName: "Angus beef mince", breed: "angus", form: "mince", group: "Breed", aliases: ["angus mince"] }),
  cut({ id: "angus-brisket", mainId: "beef", shoppingName: "Angus beef brisket", breed: "angus", form: "slow", group: "Breed", aliases: ["angus brisket"] }),
  cut({ id: "angus-oyster", mainId: "beef", shoppingName: "Angus beef oyster blade", breed: "angus", form: "steak", group: "Breed", aliases: ["angus oyster blade", "angus flat iron"] }),
  cut({ id: "angus-sirloin", mainId: "beef", shoppingName: "Angus beef sirloin steaks", breed: "angus", form: "steak", group: "Breed", aliases: ["angus sirloin", "angus porterhouse"] }),
  cut({ id: "wagyu-rump", mainId: "beef", shoppingName: "Wagyu beef rump steaks", breed: "wagyu", form: "steak", group: "Breed", aliases: ["wagyu rump", "wagu rump"] }),
  cut({ id: "wagyu-scotch", mainId: "beef", shoppingName: "Wagyu beef scotch fillet", breed: "wagyu", form: "steak", group: "Breed", aliases: ["wagyu scotch", "wagyu rib eye", "wagu"] }),
  cut({ id: "wagyu-eye", mainId: "beef", shoppingName: "Wagyu beef eye fillet", breed: "wagyu", form: "steak", group: "Breed", aliases: ["wagyu eye fillet", "wagyu tenderloin", "wagu eye"] }),
  cut({ id: "wagyu-mince", mainId: "beef", shoppingName: "Wagyu beef mince", breed: "wagyu", form: "mince", group: "Breed", aliases: ["wagyu mince", "wagu mince"] }),
  cut({ id: "wagyu-brisket", mainId: "beef", shoppingName: "Wagyu beef brisket", breed: "wagyu", form: "slow", group: "Breed", aliases: ["wagyu brisket", "wagu brisket"] }),
  cut({ id: "wagyu-oyster", mainId: "beef", shoppingName: "Wagyu beef oyster blade", breed: "wagyu", form: "steak", group: "Breed", aliases: ["wagyu flat iron", "wagyu oyster"] }),
  cut({ id: "wagyu-stir", mainId: "beef", shoppingName: "Wagyu beef stir-fry strips", breed: "wagyu", form: "slice", group: "Breed", aliases: ["wagyu strips", "wagu stir fry"] }),
  cut({ id: "beef-brisket", mainId: "beef", shoppingName: "Beef brisket", breed: "ordinary", form: "slow", group: "Less common", aliases: ["brisket"] }),
  cut({ id: "beef-osso", mainId: "beef", shoppingName: "Beef osso buco", breed: "ordinary", form: "slow", group: "Less common", aliases: ["osso buco", "ossobuco"] }),
  cut({ id: "beef-cheek", mainId: "beef", shoppingName: "Beef cheek", breed: "ordinary", form: "slow", group: "Less common", aliases: ["beef cheeks"] }),
  cut({ id: "beef-oxtail", mainId: "beef", shoppingName: "Oxtail", breed: "ordinary", form: "slow", group: "Less common", aliases: ["ox tail", "beef oxtail"] }),
  cut({ id: "beef-short-rib", mainId: "beef", shoppingName: "Beef short ribs", breed: "ordinary", form: "slow", group: "Less common", aliases: ["short rib", "short ribs"] }),
  cut({ id: "beef-skirt", mainId: "beef", shoppingName: "Beef skirt steak", breed: "ordinary", form: "steak", group: "Less common", aliases: ["skirt steak", "bavette"] }),
  cut({ id: "beef-flank", mainId: "beef", shoppingName: "Beef flank steak", breed: "ordinary", form: "steak", group: "Less common", aliases: ["flank steak"] }),
  cut({ id: "beef-hanger", mainId: "beef", shoppingName: "Beef hanger steak", breed: "ordinary", form: "steak", group: "Less common", aliases: ["hanger steak", "hanging tender"] }),
  cut({ id: "beef-tritip", mainId: "beef", shoppingName: "Beef tri-tip", breed: "ordinary", form: "steak", group: "Less common", aliases: ["tri tip", "tri-tip"] }),
  cut({ id: "beef-tongue", mainId: "beef", shoppingName: "Beef tongue", breed: "ordinary", form: "offal", group: "Less common", aliases: ["ox tongue"] }),
  cut({ id: "beef-liver", mainId: "beef", shoppingName: "Beef liver", breed: "ordinary", form: "offal", group: "Less common", aliases: ["ox liver"] }),

  cut({ id: "lamb-leg", mainId: "lamb", shoppingName: "Lamb leg steaks", breed: "ordinary", form: "steak", group: "Everyday", aliases: ["lamb leg"] }),
  cut({ id: "lamb-shoulder", mainId: "lamb", shoppingName: "Boneless lamb shoulder", breed: "ordinary", form: "slow", group: "Everyday", aliases: ["lamb shoulder"] }),
  cut({ id: "lamb-cutlet", mainId: "lamb", shoppingName: "Lamb cutlets", breed: "ordinary", form: "bone-in", group: "Everyday", aliases: ["lamb cutlet"] }),
  cut({ id: "lamb-backstrap", mainId: "lamb", shoppingName: "Lamb backstrap", breed: "ordinary", form: "steak", group: "Everyday", aliases: ["lamb loin", "backstrap"] }),
  cut({ id: "lamb-loin", mainId: "lamb", shoppingName: "Lamb loin chops", breed: "ordinary", form: "bone-in", group: "Everyday", aliases: ["loin chop", "lamb loin chop"] }),
  cut({ id: "lamb-dice", mainId: "lamb", shoppingName: "Diced lamb", breed: "ordinary", form: "slow", group: "Everyday", aliases: ["lamb cubes"] }),
  cut({ id: "lamb-mince", mainId: "lamb", shoppingName: "Lamb mince", breed: "ordinary", form: "mince", group: "Everyday", aliases: ["lamb mince", "ground lamb"] }),
  cut({ id: "lamb-shank", mainId: "lamb", shoppingName: "Lamb shanks", breed: "ordinary", form: "slow", group: "Less common", aliases: ["lamb shank"] }),
  cut({ id: "lamb-neck", mainId: "lamb", shoppingName: "Lamb neck", breed: "ordinary", form: "slow", group: "Less common", aliases: ["lamb neck chops"] }),
  cut({ id: "lamb-rump", mainId: "lamb", shoppingName: "Lamb rump", breed: "ordinary", form: "steak", group: "Less common", aliases: ["lamb rump steak"] }),
  cut({ id: "lamb-breast", mainId: "lamb", shoppingName: "Lamb breast", breed: "ordinary", form: "slow", group: "Less common", aliases: ["lamb breast"] }),
  cut({ id: "lamb-rack", mainId: "lamb", shoppingName: "Lamb rack", breed: "ordinary", form: "bone-in", group: "Less common", aliases: ["rack of lamb", "lamb rib roast"] }),
  cut({ id: "lamb-liver", mainId: "lamb", shoppingName: "Lamb liver", breed: "ordinary", form: "offal", group: "Less common", aliases: ["lambs liver"] }),
  cut({ id: "lamb-sausage", mainId: "lamb", shoppingName: "Lamb sausages", breed: "ordinary", form: "slice", group: "Less common", aliases: ["lamb sausage"] }),

  cut({ id: "pork-loin", mainId: "pork", shoppingName: "Boneless pork loin steaks", breed: "ordinary", form: "steak", group: "Everyday", aliases: ["pork loin"] }),
  cut({ id: "pork-shoulder", mainId: "pork", shoppingName: "Pork shoulder", breed: "ordinary", form: "slow", group: "Everyday", aliases: ["pork shoulder", "pork butt"] }),
  cut({ id: "pork-scotch", mainId: "pork", shoppingName: "Pork scotch fillet", breed: "ordinary", form: "steak", group: "Everyday", aliases: ["pork scotch"] }),
  cut({ id: "pork-belly", mainId: "pork", shoppingName: "Pork belly", breed: "ordinary", form: "slice", group: "Everyday", aliases: ["pork belly slices"] }),
  cut({ id: "pork-mince", mainId: "pork", shoppingName: "Pork mince", breed: "ordinary", form: "mince", group: "Everyday", aliases: ["pork mince", "ground pork"] }),
  cut({ id: "pork-fillet", mainId: "pork", shoppingName: "Pork fillet", breed: "ordinary", form: "steak", group: "Everyday", aliases: ["pork tenderloin", "pork medallions"] }),
  cut({ id: "pork-dice", mainId: "pork", shoppingName: "Diced pork", breed: "ordinary", form: "slow", group: "Everyday", aliases: ["pork cubes"] }),
  cut({ id: "pork-sausage", mainId: "pork", shoppingName: "Pork sausages", breed: "ordinary", form: "slice", group: "Everyday", aliases: ["pork sausage"] }),
  cut({ id: "pork-cutlet", mainId: "pork", shoppingName: "Pork cutlets", breed: "ordinary", form: "bone-in", group: "Less common", aliases: ["pork cutlet"] }),
  cut({ id: "pork-hock", mainId: "pork", shoppingName: "Pork hock", breed: "ordinary", form: "slow", group: "Less common", aliases: ["ham hock", "pork hock"] }),
  cut({ id: "pork-cheek", mainId: "pork", shoppingName: "Pork cheek", breed: "ordinary", form: "slow", group: "Less common", aliases: ["pork cheeks", "guanciale"] }),
  cut({ id: "pork-ribs", mainId: "pork", shoppingName: "Pork spare ribs", breed: "ordinary", form: "slow", group: "Less common", aliases: ["spare ribs", "pork ribs"] }),
  cut({ id: "pork-neck", mainId: "pork", shoppingName: "Pork neck", breed: "ordinary", form: "slow", group: "Less common", aliases: ["pork neck"] }),
  cut({ id: "pork-leg", mainId: "pork", shoppingName: "Pork leg roast", breed: "ordinary", form: "slow", group: "Less common", aliases: ["pork leg"] }),
  cut({ id: "pork-trotter", mainId: "pork", shoppingName: "Pork trotters", breed: "ordinary", form: "slow", group: "Less common", aliases: ["pig trotter", "pork trotter"] }),
];

const CUT_GROUPS: readonly CutGroup[] = ["Everyday", "Breed", "Less common"];

export function getCut(id: string): MeatCut | undefined {
  return MEAT_CUTS.find((entry) => entry.id === id);
}

export function cutsForMain(mainId: string): MeatCut[] {
  const cuts = MEAT_CUTS.filter((entry) => entry.mainId === mainId);
  return CUT_GROUPS.flatMap((group) => cuts.filter((entry) => entry.group === group));
}
