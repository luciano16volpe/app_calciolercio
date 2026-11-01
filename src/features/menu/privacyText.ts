// Testi dell'informativa privacy (menu → Privacy) e dell'avviso alla registrazione.
// Le righe sul registro attività seguono la specifica docs/specifiche/registro-attivita.md.

/** Conservazione del registro, in giorni (impostazione `audit_retention_days`; la pulizia è automatica ogni notte). */
export const AUDIT_DAYS = 60;

export const AUDIT_NOTICE =
  `Per sicurezza registriamo le azioni fatte nell'app (cosa, quando, chi) e, per 2 mesi, l'indirizzo IP e il tipo di dispositivo. ` +
  `Il registro è visibile solo all'amministratore della piattaforma e viene cancellato automaticamente dopo 2 mesi.`;

export interface PrivacySection { title: string; text: string[] }

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    title: 'Chi siamo e a cosa serve l’app',
    text: [
      'CalcioLercio è l’app di un gruppo di amici per organizzare il calcetto: rosa, squadre, partite, pagelle, classifiche.',
      'Il titolare del trattamento è l’organizzatore del gruppo (amministratore della piattaforma). Per qualsiasi richiesta sui tuoi dati scrivi a lui.',
    ],
  },
  {
    title: 'Quali dati teniamo',
    text: [
      'Account: nome, email e password (la password è conservata in forma protetta e non la vediamo).',
      'Giocatore: nome, foto, ruoli, statistiche, partite, voti, gol, assist, titoli e descrizioni delle pagelle, Gazzette.',
      'Appartenenza alle leghe e ruolo in ciascuna (membro, redazione, amministratore).',
      'Storico delle modifiche alle statistiche e ai ruoli di ogni giocatore, con la data e il nome di chi le ha cambiate.',
    ],
  },
  {
    title: 'Registro attività',
    text: [
      AUDIT_NOTICE,
      'Si registrano gli accessi e le azioni sull’account, sulle leghe e sui ruoli, sulle partite, sulle pagelle e sulle Gazzette, sui giocatori e sulle loro statistiche. Non si registra chi guarda cosa.',
      'Se cancelli il tuo account, nel registro il tuo nome diventa «utente cancellato» e IP e dispositivo vengono tolti.',
    ],
  },
  {
    title: 'Chi vede i tuoi dati',
    text: [
      'I membri di una lega vedono rosa, partite, pagelle e classifiche di quella lega. Non esistono leghe pubbliche: si entra solo con un invito.',
      'Gli amministratori di una lega vedono nome ed email dei membri di quella lega. L’amministratore della piattaforma vede l’elenco di leghe e utenti e il registro attività.',
    ],
  },
  {
    title: 'I tuoi diritti e la cancellazione',
    text: [
      'Puoi cancellare il tuo account in qualsiasi momento da questa pagina. L’account, il nome e l’email vengono eliminati.',
      'Il tuo giocatore e il suo storico (partite, voti, statistiche) restano nelle leghe, ma non sono più collegati a nessun account: è la memoria del gruppo.',
      'Se sei il creatore di una lega, la proprietà passa all’amministratore più anziano; se non ce ne sono altri, la lega resta senza proprietario finché l’amministratore della piattaforma non la assegna.',
    ],
  },
];
