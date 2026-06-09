export const OTHER_UNIVERSITY = "Other University";

type UniversityOption = {
  name: string;
  aliases?: string[];
};

export const defaultUniversitySuggestions = [
  "Imperial College London",
  "University College London",
  "University of Cambridge",
  "University of Edinburgh",
  "University of Oxford",
];

const universityOptions: UniversityOption[] = [
  { name: "Abertay University" },
  { name: "Aberystwyth University" },
  { name: "Anglia Ruskin University", aliases: ["ARU"] },
  { name: "Arden University" },
  { name: "Arts University Bournemouth", aliases: ["AUB"] },
  { name: "Aston University" },
  { name: "Bangor University" },
  { name: "Bath Spa University" },
  { name: "Birkbeck, University of London", aliases: ["Birkbeck"] },
  { name: "Birmingham City University", aliases: ["BCU"] },
  { name: "Bishop Grosseteste University" },
  { name: "Bournemouth University" },
  { name: "Brunel University of London", aliases: ["Brunel University"] },
  { name: "Buckinghamshire New University", aliases: ["BNU"] },
  { name: "Canterbury Christ Church University", aliases: ["CCCU"] },
  { name: "Cardiff Metropolitan University", aliases: ["Cardiff Met"] },
  { name: "Cardiff University" },
  { name: "City St George's, University of London", aliases: ["City University of London", "St George's University of London"] },
  { name: "Coventry University" },
  { name: "Cranfield University" },
  { name: "De Montfort University", aliases: ["DMU"] },
  { name: "Durham University" },
  { name: "Edge Hill University" },
  { name: "Edinburgh Napier University" },
  { name: "Falmouth University" },
  { name: "Glasgow Caledonian University", aliases: ["GCU"] },
  { name: "Goldsmiths, University of London", aliases: ["Goldsmiths"] },
  { name: "Harper Adams University" },
  { name: "Heriot-Watt University" },
  { name: "Imperial College London", aliases: ["Imperial"] },
  { name: "Keele University" },
  { name: "King's College London", aliases: ["KCL"] },
  { name: "Kingston University" },
  { name: "Lancaster University" },
  { name: "Leeds Arts University" },
  { name: "Leeds Beckett University" },
  { name: "Leeds Trinity University" },
  { name: "Liverpool Hope University" },
  { name: "Liverpool John Moores University", aliases: ["LJMU"] },
  { name: "London Metropolitan University" },
  { name: "London School of Economics and Political Science", aliases: ["LSE"] },
  { name: "London South Bank University", aliases: ["LSBU"] },
  { name: "Loughborough University" },
  { name: "Manchester Metropolitan University", aliases: ["MMU"] },
  { name: "Middlesex University" },
  { name: "Newcastle University" },
  { name: "Newman University" },
  { name: "Norwich University of the Arts", aliases: ["NUA"] },
  { name: "Northumbria University" },
  { name: "Nottingham Trent University", aliases: ["NTU"] },
  { name: "Oxford Brookes University" },
  { name: "Plymouth Marjon University" },
  { name: "Queen Margaret University" },
  { name: "Queen Mary University of London", aliases: ["QMUL"] },
  { name: "Queen's University Belfast", aliases: ["QUB"] },
  { name: "Ravensbourne University London" },
  { name: "Robert Gordon University", aliases: ["RGU"] },
  { name: "Royal Agricultural University" },
  { name: "Royal Central School of Speech and Drama", aliases: ["Central"] },
  { name: "Royal College of Art", aliases: ["RCA"] },
  { name: "Royal College of Music", aliases: ["RCM"] },
  { name: "Royal Conservatoire of Scotland", aliases: ["RCS"] },
  { name: "Royal Holloway, University of London", aliases: ["Royal Holloway"] },
  { name: "Royal Northern College of Music", aliases: ["RNCM"] },
  { name: "Sheffield Hallam University" },
  { name: "Solent University" },
  { name: "St Mary's University, Twickenham" },
  { name: "Staffordshire University" },
  { name: "Swansea University" },
  { name: "Teesside University" },
  { name: "The Courtauld Institute of Art", aliases: ["Courtauld Institute of Art"] },
  { name: "The Glasgow School of Art", aliases: ["GSA"] },
  { name: "The London Institute of Banking and Finance", aliases: ["LIBF"] },
  { name: "The Open University", aliases: ["Open University", "OU"] },
  { name: "The Royal Academy of Music", aliases: ["Royal Academy of Music"] },
  { name: "The Royal Veterinary College", aliases: ["Royal Veterinary College", "RVC"] },
  { name: "Ulster University" },
  { name: "University Academy 92", aliases: ["UA92"] },
  { name: "University College Birmingham", aliases: ["UCB"] },
  { name: "University College London", aliases: ["UCL"] },
  { name: "University for the Creative Arts", aliases: ["UCA"] },
  { name: "University of Aberdeen" },
  { name: "University of Bath" },
  { name: "University of Bedfordshire" },
  { name: "University of Birmingham" },
  { name: "University of Bolton" },
  { name: "University of Bradford" },
  { name: "University of Brighton" },
  { name: "University of Bristol" },
  { name: "University of Buckingham" },
  { name: "University of Cambridge", aliases: ["Cambridge University"] },
  { name: "University of Central Lancashire", aliases: ["UCLan", "University of Lancashire"] },
  { name: "University of Chester" },
  { name: "University of Chichester" },
  { name: "University of Cumbria" },
  { name: "University of Derby" },
  { name: "University of Dundee" },
  { name: "University of East Anglia", aliases: ["UEA"] },
  { name: "University of East London", aliases: ["UEL"] },
  { name: "University of Edinburgh" },
  { name: "University of Essex" },
  { name: "University of Exeter" },
  { name: "University of Glasgow" },
  { name: "University of Gloucestershire" },
  { name: "University of Greenwich" },
  { name: "University of Hertfordshire" },
  { name: "University of Huddersfield" },
  { name: "University of Hull" },
  { name: "University of Kent" },
  { name: "University of Leeds" },
  { name: "University of Leicester" },
  { name: "University of Lincoln" },
  { name: "University of Liverpool" },
  { name: "University of London" },
  { name: "University of Manchester" },
  { name: "University of Northampton" },
  { name: "University of Nottingham" },
  { name: "University of Oxford", aliases: ["Oxford University"] },
  { name: "University of Plymouth" },
  { name: "University of Portsmouth" },
  { name: "University of Reading" },
  { name: "University of Roehampton" },
  { name: "University of Salford" },
  { name: "University of Sheffield" },
  { name: "University of South Wales" },
  { name: "University of Southampton" },
  { name: "University of St Andrews", aliases: ["St Andrews University"] },
  { name: "University of Stirling" },
  { name: "University of Strathclyde" },
  { name: "University of Suffolk" },
  { name: "University of Sunderland" },
  { name: "University of Surrey" },
  { name: "University of Sussex" },
  { name: "University of the Arts London", aliases: ["UAL"] },
  { name: "University of the Highlands and Islands", aliases: ["UHI"] },
  { name: "University of the West of England", aliases: ["UWE Bristol", "UWE"] },
  { name: "University of Wales Trinity Saint David", aliases: ["UWTSD"] },
  { name: "University of Warwick", aliases: ["Warwick University"] },
  { name: "University of West London", aliases: ["UWL"] },
  { name: "University of Westminster" },
  { name: "University of Winchester" },
  { name: "University of Wolverhampton" },
  { name: "University of Worcester" },
  { name: "University of York" },
  { name: "Wrexham University" },
  { name: "York St John University" },
];

export const universities = universityOptions.map((option) => option.name);

const stopWords = new Set(["and", "at", "for", "in", "of", "the"]);

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function acronymFor(value: string) {
  return normalizeSearchText(value)
    .split(" ")
    .filter((word) => word && !stopWords.has(word))
    .map((word) => word[0])
    .join("");
}

function levenshteinDistance(a: string, b: string) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + substitutionCost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length] ?? 0;
}

function fuzzyRatio(a: string, b: string) {
  return levenshteinDistance(a, b) / Math.max(a.length, b.length, 1);
}

function scoreCandidate(name: string, query: string) {
  const normalizedName = normalizeSearchText(name);
  const words = normalizedName.split(" ").filter(Boolean);
  const queryTokens = query.split(" ").filter(Boolean);
  const acronym = acronymFor(name);

  if (normalizedName === query || acronym === query) {
    return 0;
  }

  if (acronym.startsWith(query)) {
    return 0.3 + (acronym.length - query.length) / 100;
  }

  if (normalizedName.startsWith(query)) {
    return 1 + (normalizedName.length - query.length) / 1000;
  }

  const wordPrefixIndex = words.findIndex((word) => word.startsWith(query));
  if (wordPrefixIndex >= 0) {
    return 1.2 + wordPrefixIndex / 100;
  }

  if (queryTokens.length > 1 && queryTokens.every((token) => words.some((word) => word.startsWith(token) || word.includes(token)))) {
    return 1.5 + queryTokens.length / 100;
  }

  const containsIndex = normalizedName.indexOf(query);
  if (containsIndex >= 0) {
    return 2 + containsIndex / 100;
  }

  if (query.length >= 3) {
    const ratios = [fuzzyRatio(query, normalizedName), ...words.map((word) => fuzzyRatio(query, word))];
    const bestRatio = Math.min(...ratios);
    if (bestRatio <= 0.35) {
      return 3 + bestRatio;
    }
  }

  return null;
}

function optionScore(option: UniversityOption, query: string) {
  const names = [option.name, ...(option.aliases ?? [])];
  const scores = names
    .map((name) => scoreCandidate(name, query))
    .filter((score): score is number => score !== null);

  if (scores.length === 0) {
    return null;
  }

  return Math.min(...scores);
}

export function getUniversitySuggestions(search: string, limit = 5) {
  const query = normalizeSearchText(search);

  if (!query) {
    return defaultUniversitySuggestions.slice(0, limit);
  }

  const matches = universityOptions
    .map((option) => ({ name: option.name, score: optionScore(option, query) }))
    .filter((match): match is { name: string; score: number } => match.score !== null)
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((match) => match.name);

  return matches.length > 0 ? matches : [OTHER_UNIVERSITY];
}
