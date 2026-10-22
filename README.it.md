<p align="center"><img src="https://raw.githubusercontent.com/Rocco3D/FlowPilot/main/assets/brand/banner.png" alt="FlowPilot" width="100%"></p>

<p align="center"><a href="README.md">English</a> &nbsp;|&nbsp; <b>Italiano</b></p>

# FlowPilot

FlowPilot è un servizio locale che controlla Google Flow (generazione di immagini e video con intelligenza artificiale) attraverso il tuo Chrome già collegato, usando i tuoi crediti della sottoscrizione Flow. Puoi usarlo dalla CLI (`flowpilot`), da un'API HTTP locale (solo 127.0.0.1, protetta da token) e come server MCP per assistenti AI (Claude Code, Codex, Cursor e altri).

**Status:** beta

## Requisiti

- Windows 10/11, oppure macOS/Linux (supporto Windows di prima categoria)
- Node.js 22.12 o più recente
- Git
- Google Chrome
- Un account Google con accesso a Google Flow
- Crediti Google AI per la generazione di video (la generazione di immagini con i modelli Nano Banana è gratuita)

## Installazione

```bash
git clone https://github.com/Rocco3D/FlowPilot.git
cd FlowPilot
npm install
npm run build
npm link
```

Dopo l'installazione, `flowpilot` è disponibile nel tuo terminale. Non cancellare la cartella `FlowPilot`: il comando `flowpilot` funziona da lì.

Se hai installato FlowPilot con `npm install -g Rocco3D/FlowPilot`, esegui prima `npm uninstall -g flowpilot-cli`, poi installalo come indicato sopra.

### Aggiornamento

`flowpilot doctor` (e lo strumento MCP `doctor`) ti avvisa quando su GitHub è disponibile una versione più recente. Per aggiornare, esegui questi comandi nella cartella `FlowPilot`:

```bash
git pull
npm install
npm run build
```

Poi esegui `flowpilot service stop`: il comando `flowpilot` successivo avvia la nuova versione. Se usi FlowPilot da un assistente AI, riavvia anche l'assistente, così il suo server MCP usa la nuova versione.

Ogni aggiornamento alza la versione di 0.0.1 (per esempio da 0.1.0 a 0.1.1). Le modifiche sono elencate in [CHANGELOG.md](CHANGELOG.md).

## Primo accesso

Accedi con il tuo account Google:

```bash
flowpilot login
```

Si apre una finestra di Chrome ordinaria dove puoi accedere con Google. Se Flow mostra i termini da accettare, accettali. Chiudi la finestra quando hai finito, poi verifica la configurazione:

```bash
flowpilot doctor
```

Questo controlla che Chrome sia in esecuzione, che la connessione API funzioni e che tu sia collegato. Ti avvisa anche quando è disponibile una versione più recente di FlowPilot.

## Genera

### Generazione di immagini

```bash
flowpilot image --prompt "Un paesaggio tranquillo al tramonto" --model "Nano Banana 2.1" --ratio 1:1
```

### Generazione di video

```bash
flowpilot video --prompt "Un gatto che cammina in un giardino soleggiato" --model "Veo 3.1 - Lite" --ratio 16:9
```

Leggi il prompt da un file invece di passarlo sulla linea di comando:

```bash
flowpilot video --prompt-file prompt.md --model "Veo 3.1 - Lite"
```

### Omni (generazione universale)

```bash
flowpilot video --prompt "Una cascata che scorre" --model "Omni 1.1 Flash" --resolution 720p --duration 4
```

### Opzioni avanzate

- `--ratio 16:9`: Proporzioni (immagini e video; il default dipende dal modello)
- `--resolution 720p`: risoluzione di Omni, quando Flow offre una scelta (per esempio 360p o 720p)
- `--duration 4`: Durata del video in secondi
- `--outputs 2`: Genera più output (1–4)
- `--start-frame path.jpg`: Frame iniziale per il continuo del video
- `--ingredient path.jpg`: Immagine di riferimento per lo stile
- `--character "Nome Personaggio"`: Personaggio di riferimento
- `--no-wait`: Invia il job e esci subito (per default, la CLI attende che il job finisca)
- `--json`: Restituisci JSON invece di testo leggibile
- `--out ~/Downloads`: Salva i risultati in una cartella personalizzata (default: cartella output configurata)
- `--upscale 4k`: Qualità del download: `original`, `1080p` (2K per le immagini) o `4k`. Se non indicata, FlowPilot scarica la qualità migliore che il tuo piano Flow offre: 4K se il piano la include, altrimenti l'upscale 1080p/2K, altrimenti l'originale. Una qualità chiesta che il piano non offre fa fallire il job
- `--max-credits 10`: Abbassa il limite di crediti per job di questa esecuzione (non può mai aumentarlo)
- `--confirm`: Consenti al job di superare i limiti per job e mensile

## Modelli e crediti

I modelli e i loro costi in crediti a ottobre 2026:

**Modelli video:**

- **Omni 1.1 Flash**: 720p, durate 4/6/8/10 secondi, 7–15 crediti (a volte Flow offre anche 360p, 4–7 crediti; con primo/ultimo fotogramma solo 720p e 4/6/8 secondi)
- **Veo 3.1 - Lite**: 720p, 8 secondi, 10 crediti
- **Veo 3.1 - Fast**: 720p, 8 secondi, 20 crediti
- **Veo 3.1 - Quality**: 720p, 8 secondi, 100 crediti

Tutti i modelli video supportano l'audio.

**Modelli di immagini:**

- **Nano Banana Pro**: 0 crediti su Google AI Pro
- **Nano Banana 2.1**: 0 crediti su Google AI Pro
- **Nano Banana 2 Lite**: 0 crediti su Google AI Pro

### Elenco dei modelli disponibili

```bash
flowpilot models
```

Questo legge l'elenco live da Flow.

### Un modello che Flow non offre più

I nomi dei modelli cambiano: `Nano Banana 2` è diventato `Nano Banana 2.1`. Chiedere un modello che Flow non offre
fallisce il job con un messaggio che elenca quelli disponibili, e `flowpilot doctor` lo dice prima che tu spenda
qualcosa.

C'è un caso automatico. Se il job usa il modello configurato come predefinito (`defaultVideoModel` o
`defaultImageModel`) e Flow offre la **versione successiva dello stesso nome**, FlowPilot usa quella, te lo dice nel
risultato del job e corregge la configurazione, così succede una volta sola:

```
Il modello configurato Nano Banana 2 non è più offerto da Flow, quindi questo job ha usato Nano Banana 2.1. La configurazione è stata aggiornata.
```

Nient'altro viene inventato. Un modello chiesto esplicitamente con `--model` non viene mai sostituito, perché quello
l'hai chiesto tu con quel nome: fallisce e elenca i modelli disponibili. Vedi [docs/known-issues.md](docs/known-issues.md).

### Protezione dei crediti

FlowPilot protegge il tuo account con due limiti:

- **Limite per job** (default 20 crediti): I job che superano questo limite vengono rifiutati a meno che tu non passi `--confirm`
- **Limite mensile** (default 1000 crediti): Se stai per raggiungere il limite mensile, i job vengono rifiutati a meno che tu non passi `--confirm`

Controlla il tuo consumo:

```bash
flowpilot credits
```

Il consumo e i limiti li conta FlowPilot. Lo stesso comando mostra anche il saldo reale dei tuoi crediti Google Flow, letto dal pannello dell'account di Flow. Mentre è in corso un job mostra l'ultimo saldo letto, senza toccare la pagina. Dopo ogni generazione, il risultato del job contiene il saldo rimasto (`balance`).

## Job e il servizio

Una sola sessione Flow è in esecuzione alla volta. I job vengono eseguiti uno alla volta in una coda.

La CLI avvia automaticamente il servizio di background se non è già in esecuzione. Puoi anche gestirlo manualmente:

```bash
flowpilot service start
flowpilot service stop
flowpilot service status
```

### Gestisci i job

Elenca tutti i job (i più recenti per primi):

```bash
flowpilot jobs
```

Ottieni i dettagli di un job specifico:

```bash
flowpilot job <id>
```

Annulla un job in coda:

```bash
flowpilot cancel <id>
```

Annullare un job che è già in esecuzione o in download non ha effetto.

### Media già in Flow

Le immagini e i video già presenti in un progetto Flow, da un job precedente, da un altro strumento o da un caricamento,
si possono elencare e scaricare di nuovo senza generare niente e senza spendere crediti, dall'[API HTTP](docs/api.md)
(`GET /media`, `POST /media/download`) o dal [server MCP](docs/mcp.md) (`list_media`, `download_media`). Non c'è un
comando della CLI. Il file viene salvato come `<progetto>-media-<id>`.

### Arresto del servizio

Ferma il servizio e chiudi la finestra del browser:

```bash
flowpilot service stop
```

Il servizio si ferma anche automaticamente dopo essere rimasto inattivo per un numero configurato di minuti (default 30; impostato a 0 per disabilitare).

## Configurazione

Tutte le impostazioni possono essere lette e cambiate con `flowpilot config`:

```bash
flowpilot config get                    # Mostra tutte le impostazioni
flowpilot config get outputDir          # Mostra un'impostazione
flowpilot config set outputDir ~/Video  # Cambia un'impostazione
```

| Chiave               | Default               | Significato                                                                                                                    |
| -------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `outputDir`          | `Documents\FlowPilot` | Dove salvare i file generati                                                                                                   |
| `defaultVideoModel`  | (auto)                | Modello per i job video senza `--model`                                                                                        |
| `defaultImageModel`  | (auto)                | Modello per i job image senza `--model`                                                                                        |
| `outputs`            | 1                     | Output per job quando non ne sono richiesti (1–4)                                                                              |
| `maxCreditsPerJob`   | 20                    | Limite di crediti per job                                                                                                      |
| `monthlyCreditLimit` | 1000                  | Budget mensile di crediti                                                                                                      |
| `locale`             | (auto)                | Lingua: `en` o `it`; rilevamento automatico dal sistema                                                                        |
| `port`               | 47820                 | Porta dell'API HTTP                                                                                                            |
| `logLevel`           | info                  | Livello di log: debug, info, warn, error                                                                                       |
| `acceptUploadRights` | true                  | Accetta automaticamente la finestra di dialogo dei diritti per i caricamenti                                                   |
| `idleMinutes`        | 30                    | Minuti prima che il servizio si fermi automaticamente (0 = mai)                                                                |
| `showBrowser`        | false                 | Mostra la finestra di automazione sulla metà sinistra dello schermo, per vedere FlowPilot lavorare (normalmente fuori schermo) |

Senza `defaultVideoModel` o `defaultImageModel` viene usato il modello già selezionato in Flow.

Le modifiche a `idleMinutes`, `showBrowser` e `locale` valgono dal prossimo avvio del servizio (dopo `flowpilot stop` o una chiusura automatica). `defaultVideoModel`, `defaultImageModel` e `outputs` vengono lette a ogni job creato. FlowPilot riscrive `defaultVideoModel` e `defaultImageModel` quando Flow ritira il modello configurato e offre la versione successiva dello stesso nome; `outputs`, i limiti e la lingua li cambi solo tu.

## Lingue

FlowPilot è disponibile in inglese e italiano.

La lingua dell'interfaccia è scelta da:

1. `flowpilot config set locale en` oppure `locale it`
2. Variabile d'ambiente: `FLOWPILOT_LANG=en` oppure `FLOWPILOT_LANG=it`
3. Lingua del sistema (se italiano, usa l'italiano; altrimenti inglese)

Vince la prima: `FLOWPILOT_LANG` viene usata solo se `locale` non è impostata. Valori diversi da `en` e `it` vengono ignorati, non segnalati come errori. Vale per la CLI e per i messaggi di errore che il servizio restituisce via API HTTP; i file di log restano in inglese.

## Usa da altre app

### API HTTP locale

L'API HTTP locale su `http://127.0.0.1:47820` ti permette di integrare FlowPilot con altri strumenti. Riferimento completo: [docs/api.md](docs/api.md)

### Server MCP per assistenti AI

Esegui FlowPilot come server MCP per Claude Code, Codex, Cursor e altri assistenti AI:

**Claude Code:**

```
claude mcp add flowpilot -- flowpilot mcp
```

Riferimento completo: [docs/mcp.md](docs/mcp.md)

## Auto-test e risoluzione dei problemi

Prova la configurazione senza spendere crediti:

```bash
flowpilot selftest
```

Questo controlla che l'interfaccia di Flow risponda e che i selettori siano corretti.

### Modalità Agent di Flow

FlowPilot usa la casella del prompt classica di Flow. Se in Flow è attiva la modalità Agent, o è aperto il suo pannello di chat a destra, FlowPilot chiude il pannello e spegne la modalità Agent prima di leggere i modelli o eseguire un job. Se non ci riesce, si ferma con l'errore `agent_mode_on`: spegni la modalità Agent in Flow e riprova.

### Se l'interfaccia di Flow cambia

Tutti i selettori DOM per Flow si trovano in un solo file: `src/flow/selectors.ts`. Se Flow cambia il suo layout, FlowPilot fallirà a un passo specifico. I selettori possono essere aggiornati senza cambiare nessun altro codice. [docs/flow-ui.md](docs/flow-ui.md) descrive cosa controlla FlowPilot nella pagina, come la usa un job e cosa si vede da fuori quando il layout cambia.

### Se Chrome era già aperto con il profilo

Se hai aperto tu Chrome sul profilo di FlowPilot, FlowPilot lo chiude e riapre lo stesso profilo con una connessione di
debug, e `doctor` lo dice una volta:

```
Chrome era già in esecuzione sul profilo, quindi FlowPilot lo ha chiuso e riaperto con una connessione di debug.
```

Le schede aperte in quella finestra si perdono. È il comportamento previsto, non un errore.

### Cosa non funziona

[docs/known-issues.md](docs/known-issues.md) elenca i limiti da conoscere: un job alla volta, media già in Flow
raggiungibili solo dall'API HTTP e dal server MCP, qualità del download, nessun retry automatico, Flow pilotato in
inglese e la chiusura per inattività.

### Log

I log vengono scritti nella cartella dati:

- **Windows**: `%LOCALAPPDATA%\FlowPilot\logs`
- **macOS**: `~/Library/Application Support/FlowPilot/logs`
- **Linux**: `~/.local/share/flowpilot/logs`

I log sono organizzati per giorno. Un riepilogo JSON viene scritto accanto a ogni risultato di job.

## Caricamenti e conferma dei diritti di Google

Quando un job usa file di riferimento (frame iniziale/finale, ingredienti), Flow ti chiede di confermare che hai i diritti per ogni file caricato e che rispetti la Politica di uso proibito di Google. FlowPilot fa clic su "Accetto" automaticamente per default, così che i job in coda possono essere eseguiti senza supervizione. Usando file di riferimento stai facendo quella dichiarazione personalmente.

Per disattivare questo, esegui `flowpilot config set acceptUploadRights false`. I job con caricamenti si fermeranno con una spiegazione.

## Disclaimer

FlowPilot è ufficioso. Non è affiliato con o approvato da Google. Automatizza la tua stessa sessione Google Flow nel tuo stesso browser, e sei responsabile del rispetto dei Termini di servizio di Google.

## Licenza

Il codice e la documentazione sono rilasciati con licenza MIT, vedi `LICENSE`.

**Loghi e nomi esclusi:** il logo di FlowPilot, il logo di Rocco e il nome Rocco™ (file in `assets/brand/`) non sono coperti dalla licenza MIT. Tutti i diritti riservati; non possono essere riutilizzati senza permesso. Vedi `assets/brand/NOTICE.md`.

## Riconoscimenti

FlowPilot è partito da [gflow-cli](https://github.com/swissmarley/gflow-cli) di swissmarley (licenza MIT) e ne ha preso ispirazione: è il progetto che ha mostrato come controllare Google Flow attraverso una vera sessione di Chrome già collegata. Parte del codice della sessione del browser e dell'automazione di Flow deriva da lì; vedi [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

<p align="center"><img src="https://raw.githubusercontent.com/Rocco3D/FlowPilot/main/assets/brand/rocco-logo.png" alt="Rocco logo" height="40" align="absmiddle">&nbsp;<b>Rocco™</b></p>
