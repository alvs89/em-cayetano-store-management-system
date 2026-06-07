const COMMON_EMAIL_DOMAIN_CORRECTIONS = new Map([
  ["gmai.com", "gmail.com"],
  ["gmal.com", "gmail.com"],
  ["gmial.com", "gmail.com"],
  ["gmail.c", "gmail.com"],
  ["gmail.cm", "gmail.com"],
  ["gmail.co", "gmail.com"],
  ["gmail.con", "gmail.com"],
  ["gmail.comm", "gmail.com"],
  ["gmail.comn", "gmail.com"],
  ["yaho.com", "yahoo.com"],
  ["yhoo.com", "yahoo.com"],
  ["yahoo.c", "yahoo.com"],
  ["yahoo.cm", "yahoo.com"],
  ["yahoo.co", "yahoo.com"],
  ["yahoo.con", "yahoo.com"],
  ["yahoo.comm", "yahoo.com"],
  ["yahoo.comn", "yahoo.com"],
  ["outlook.c", "outlook.com"],
  ["outlook.cm", "outlook.com"],
  ["outlook.co", "outlook.com"],
  ["outlook.con", "outlook.com"],
  ["outlook.comm", "outlook.com"],
  ["outlook.comn", "outlook.com"],
  ["hotmail.c", "hotmail.com"],
  ["hotmail.cm", "hotmail.com"],
  ["hotmail.co", "hotmail.com"],
  ["hotmail.con", "hotmail.com"],
  ["hotmail.comm", "hotmail.com"],
  ["hotmail.comn", "hotmail.com"],
  ["icloud.c", "icloud.com"],
  ["icloud.cm", "icloud.com"],
  ["icloud.co", "icloud.com"],
  ["icloud.con", "icloud.com"],
  ["icloud.comm", "icloud.com"],
  ["icloud.comn", "icloud.com"],
]);

export function getEmailTypoSuggestion(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const atIndex = cleanEmail.lastIndexOf("@");

  if (atIndex <= 0 || atIndex === cleanEmail.length - 1) return null;

  const localPart = cleanEmail.slice(0, atIndex);
  const domain = cleanEmail.slice(atIndex + 1);
  const correctedDomain = COMMON_EMAIL_DOMAIN_CORRECTIONS.get(domain);

  if (!correctedDomain || correctedDomain === domain) return null;

  return {
    entered: cleanEmail,
    suggested: `${localPart}@${correctedDomain}`,
  };
}
