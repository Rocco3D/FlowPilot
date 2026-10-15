export default {
  "http.unauthorized": "Token API mancante o non valido",
  "http.badHost":
    "Header Host non previsto: la richiesta deve puntare a 127.0.0.1 o localhost sulla porta del servizio",
  "http.notFound": "Non trovato",
  "http.badJson": "Il corpo della richiesta non è JSON valido",
  "http.bodyTooLarge": "Il corpo della richiesta è troppo grande (limite 1 MB)",
  "http.valueRequired": 'Il corpo della richiesta deve essere {"value": string}',
} as const;
