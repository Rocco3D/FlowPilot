export default {
  "http.unauthorized": "Missing or invalid API token",
  "http.badHost":
    "Unexpected Host header: the request must target 127.0.0.1 or localhost on the service port",
  "http.notFound": "Not found",
  "http.badJson": "Request body is not valid JSON",
  "http.bodyTooLarge": "Request body is too large (limit 1 MB)",
  "http.valueRequired": 'Request body must be {"value": string}',
  "http.projectAndNewProject": "Use only one of project and newProject",
  "http.confirmRequired": 'Deleting cannot be undone: send {"confirm": true}',
} as const;
