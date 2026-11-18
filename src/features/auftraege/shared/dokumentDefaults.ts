export const DEFAULT_KOPF = `Sehr geehrte Damen und Herren,

vielen Dank für Ihren Auftrag und das damit verbundene Vertrauen!
Hiermit stelle ich Ihnen die folgenden Leistungen in Rechnung:`

export const DEFAULT_FUSS = `Bitte überweisen Sie nach Erhalt den Rechnungsbetrag unter Angabe Ihrer Rechnungsnummer auf unser Konto bei der Erste Bank:

Empfänger: Quick Energy Handels GmbH
IBAN: AT62 2011 1290 2612 2005`

export function gutschriftKopf(rechnungsnummer?: string | null): string {
  return rechnungsnummer
    ? `Sehr geehrte Damen und Herren!

Anbei Ihre Gutschrift zu der Rechnung Nr. ${rechnungsnummer}.`
    : `Sehr geehrte Damen und Herren!

Anbei Ihre Gutschrift.`
}

// Gutschrift: keine Zahlungsaufforderung im Fuß
export const GUTSCHRIFT_FUSS = ''
