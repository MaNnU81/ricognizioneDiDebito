# Ricognizione Debito — Webapp

Struttura identica a quella usata per il fantamondiale: **GitHub Pages** (frontend) + **Google Apps Script** (backend) + **Google Sheet** (database).

## File inclusi
- `Ricognizione_Debito_GoogleSheet.xlsx` → il foglio con i 3 tab già pronti e i dati storici importati e puliti
- `Code.gs` → backend Apps Script
- `index.html` → il sito (login, dashboard, grafici, registro, export PDF)

## Setup (15 minuti)

### 1. Crea il Google Sheet
1. Carica `Ricognizione_Debito_GoogleSheet.xlsx` su Google Drive
2. Tasto destro → **Apri con → Google Sheets** (si converte automaticamente)
3. Nel tab **Utenti**, cambia `CAMBIAMI1` e `CAMBIAMI2` con le password vere dei due utenti (lascia i ruoli `write` e `read` come sono)
4. Controlla nel tab **Config** che `TotaleDebito` (40000) sia corretto

### 2. Pubblica il backend (Apps Script)
1. Nel Google Sheet: **Estensioni → Apps Script**
2. Cancella il contenuto di default e incolla tutto `Code.gs`
3. **Distribuisci → Nuova implementazione**
   - Tipo: **App web**
   - Esegui come: **Tuo account**
   - Chi ha accesso: **Chiunque**
4. Autorizza i permessi richiesti (è il tuo Sheet, è normale chieda accesso)
5. Copia l'URL che ti dà (finisce con `/exec`)

### 3. Collega il frontend
1. Apri `index.html` con un editor di testo
2. Trova la riga:
   ```js
   API_URL: 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE'
   ```
3. Sostituiscila con l'URL copiato al punto 2.4

### 4. Pubblica su GitHub Pages
Stesso procedimento usato per `fantamondiale`: crea un repo (es. `ricognizione-debito`), carica `index.html`, attiva GitHub Pages dalle impostazioni del repo.

## Note
- Le credenziali (utente/password) restano salvate nel browser (`localStorage`) dopo il primo login, così la persona che usa il ruolo "lettura" non deve reinserirle ogni volta.
- Ogni volta che modifichi manualmente il Google Sheet, la webapp lo rilegge in tempo reale al refresh — non serve toccare il codice.
- Se in futuro vuoi cambiare l'importo mensile o il totale del debito, basta modificare i valori nel tab **Config** del foglio.
