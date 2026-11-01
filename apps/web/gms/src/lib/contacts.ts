/**
 * GMS's published contact details, shared by the contact page and the footer
 * so the two never drift apart.
 */
export const GMS_CONTACTS = {
  mainLine: { label: "+1 473 444 4142", tel: "+14734444142" },
  forecastOffice: {
    label: "+1 473 444 4101, extension 2059",
    short: "+1 473 444 4101 ext. 2059",
    tel: "+14734444101,2059",
  },
  whatsApp: { label: "+1 473 534 5234" },
  email: "meteorology@gaa.gd",
} as const;
