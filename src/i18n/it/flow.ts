export default {
  "session.chromeNotFound":
    "Google Chrome non è stato trovato. Tentato: {tried}. Installa Chrome o imposta FLOWPILOT_CHROME_PATH al suo eseguibile.",
  "session.noDebugPort":
    "Chrome non ha aperto una porta di debug per il profilo {profileDir}. Chiudi tutte le finestre di Chrome che usano quel profilo e riprova.",
  "session.connectFailed":
    "Non riesco a connettermi a Chrome sulla porta {port}. Esegui il comando di accesso, accedi, poi riprova. ({reason})",
  "session.statusConnected": "Chrome è in esecuzione e FlowPilot è collegato.",
  "session.statusRunning":
    "Chrome è in esecuzione sul profilo ma non è disponibile alcuna connessione di debug.",
  "session.statusStopped": "Chrome non è in esecuzione sul profilo.",
  "nav.projectNotFound": "Nessun progetto Flow corrisponde a {project}.",
  "nav.projectNotOpened": "Flow non ha aperto una pagina di progetto.",
  "models.settingsNotOpen": "Il popover delle impostazioni di Flow non si è aperto.",
  "models.menuNotOpen": "Il menu del modello di Flow non si è aperto.",
  "gen.unsupportedInput":
    "I fotogrammi iniziali, finali, gli ingredienti e i personaggi non sono ancora supportati.",
  "gen.settingsNotApplied": "Flow non ha applicato le impostazioni richieste: {details}.",
  "gen.settingsMismatch": "{field} dovrebbe essere {wanted} ma è {actual}",
  "gen.creditsUnreadable": "Non riesco a leggere il costo dei crediti da Flow.",
  "gen.promptNotSet": "La casella del prompt è vuota dopo aver digitato il prompt.",
  "gen.submitNotReady": "Il pulsante Avvia generazione non è diventato abilitato.",
  "gen.timeout": "Flow non ha completato la generazione in {minutes} minuti.",
  "gen.rateLimited":
    "Flow ha segnalato un'attività insolita o un limite di velocità. Attendi un po' e riprova.",
  "gen.creditsExhausted": "Flow segnala che l'account è senza crediti.",
  "gen.blocked": "Flow ha rifiutato il prompt (politica sui contenuti).",
  "gen.failed": "Flow ha segnalato che la generazione non è riuscita.",
  "download.viewerNotOpened": "Flow non ha aperto il visualizzatore dei risultati.",
  "download.tierLocked": "Il tier di download richiesto necessita un aggiornamento del piano Flow.",
  "download.fetchFailed": "Non riesco a scaricare un risultato (HTTP {status}).",
  "download.noSource": "Non riesco a trovare il file multimediale di un risultato.",
  "driver.notSignedIn": "Chrome è collegato ma non è acceso a Flow. Esegui il comando di accesso.",
  "driver.fatal": "Il servizio FlowPilot è fallito: {reason}",
} as const;
