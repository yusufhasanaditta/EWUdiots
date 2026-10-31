/* Companies in Bangladesh that often back university club events: a starting list for clubs to approach, not partners
   of EWUdiots or of any club. "fit" is how likely they are to say yes to a student event, from what they've sponsored
   at Dhaka universities before (tech fests, hackathons, career fairs, cultural shows). Names only, no logos. */
export const PROSPECTS = [
  { name: "Grameenphone", industry: "Telecom", fit: 90, icon: "phone", backs: "Tech fests, hackathons, career fairs", web: "https://www.grameenphone.com" },
  { name: "Robi Axiata", industry: "Telecom", fit: 85, icon: "phone", backs: "Innovation contests, campus events", web: "https://www.robi.com.bd" },
  { name: "Banglalink", industry: "Telecom", fit: 80, icon: "phone", backs: "Youth programs, cultural shows", web: "https://www.banglalink.net" },
  { name: "bKash", industry: "Fintech", fit: 85, icon: "wallet", backs: "Business case contests, fests, payment partner", web: "https://www.bkash.com" },
  { name: "Nagad", industry: "Fintech", fit: 70, icon: "wallet", backs: "Campus fests, payment partner", web: "https://nagad.com.bd" },
  { name: "Brain Station 23", industry: "Software", fit: 85, icon: "zap", backs: "Programming contests, hackathons, job fairs", web: "https://brainstation-23.com" },
  { name: "BJIT", industry: "Software", fit: 75, icon: "zap", backs: "Programming contests, tech talks", web: "https://bjitgroup.com" },
  { name: "Therap (BD)", industry: "Software", fit: 75, icon: "zap", backs: "Programming contests (ICPC-style)", web: "https://www.therapbd.com" },
  { name: "Enosis Solutions", industry: "Software", fit: 70, icon: "zap", backs: "Coding contests, career talks", web: "https://www.enosisbd.com" },
  { name: "Cefalo Bangladesh", industry: "Software", fit: 65, icon: "zap", backs: "Hackathons, tech talks", web: "https://www.cefalo.com" },
  { name: "Samsung R&D Institute BD", industry: "Technology", fit: 70, icon: "brain", backs: "Programming contests, research events", web: "https://research.samsung.com/srbd" },
  { name: "Walton", industry: "Electronics", fit: 70, icon: "bulb", backs: "Robotics, innovation and tech fairs", web: "https://waltonbd.com" },
  { name: "Pathao", industry: "Startup", fit: 65, icon: "truck", backs: "Startup talks, hackathons", web: "https://pathao.com" },
  { name: "Daraz Bangladesh", industry: "E-commerce", fit: 60, icon: "bag", backs: "Business contests, campus ambassador programs", web: "https://www.daraz.com.bd" },
  { name: "10 Minute School", industry: "EdTech", fit: 75, icon: "school", backs: "Learning events, olympiads, workshops", web: "https://10minuteschool.com" },
  { name: "BRAC Bank", industry: "Banking", fit: 70, icon: "building", backs: "Business competitions, career fairs", web: "https://www.bracbank.com" },
  { name: "Dutch-Bangla Bank", industry: "Banking", fit: 60, icon: "building", backs: "Scholarships, campus events", web: "https://www.dutchbanglabank.com" },
  { name: "Unilever Bangladesh", industry: "FMCG", fit: 65, icon: "briefcase", backs: "Business case contests, leadership programs", web: "https://www.unilever.com.bd" },
  { name: "BAT Bangladesh", industry: "FMCG", fit: 50, icon: "briefcase", backs: "Business case contests (not tobacco-branded events)", web: "https://www.batbangladesh.com" },
  { name: "Coca-Cola Bangladesh", industry: "Beverage", fit: 55, icon: "coffee", backs: "Cultural shows, sports and fests", web: "https://www.coca-colacompany.com" }
];
export const fitLabel = (n) => (n >= 80 ? ["Very likely", "green"] : n >= 65 ? ["Likely", "blue"] : ["Worth a try", "amber"]);
