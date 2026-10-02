export default {
  "error.internal": "Errore interno",
  "jobs.notFound": "Job non trovato: {id}",
  "queue.notCancellable": "Il job {id} non può essere annullato perché è {status}",
  "config.invalid": "File di configurazione non valido {path}: {reason}",
  "config.unknownKey": "Chiave di configurazione sconosciuta: {key}",
  "credits.overJobLimit":
    "Questo job costa {cost} crediti, al di sopra del limite per job di {limit}. Usa --confirm per consentirlo.",
  "credits.overMonthlyLimit":
    "Limite di crediti mensili superato: {spent} spesi, questo job costa {cost}, il limite è {limit}.",
} as const;
