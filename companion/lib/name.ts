// Her first name for the greeting: the name on the account when it has one, else the first word of the email
// before the @ ("arya.k@..." is Arya; digits and separators end the word). Empty when neither gives a name.
export function firstName(u: { email?: string | null; user_metadata?: Record<string, unknown> | null }): string {
  const named = [u.user_metadata?.full_name, u.user_metadata?.name].find((x): x is string => typeof x === "string" && !!x.trim());
  const word = named ? named.trim().split(/\s+/)[0] : (u.email ?? "").split("@")[0].split(/[^a-zA-Z]+/)[0];
  return word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : "";
}
