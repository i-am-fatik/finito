const locale = {
  "page": {
    "editAccount": "Upravit účet",
    "newAccount": "Nový účet",
    "tabsSections": "Sekce"
  },
  "table": {
    "accounts": "Účty",
    "description": {
      "list-of-your-accounts": "Seznam vašich účtů (bankovní účty, peněženky apod.)"
    },
    "actions": {
      "new-account": "Nový účet"
    },
    "columns": {
      "name": "Název",
      "type": "Typ",
      "address": "Adresa",
      "currency": "Měna"
    },
    "search": {
      "placeholder": {
        "by-name": "Hledat podle názvu..."
      }
    }
  },
  "form": {
    "account-form": {
      "label": {
        "name": "Název",
        "protocol": "Protokol",
        "iban": "IBAN",
        "currency": "Měna",
        "lud16": "LUD16",
        "gateway-url": "URL gateway",
        "gateway-token": "Token gateway",
        "fio-read-token": "Fio token pro čtení",
        "credentials": "Přihlašovací údaje",
        "seed": "Seed",
        "mnemonic": "Mnemonická fráze"
      },
      "tag": {
        "account-iban": "Bankovní účet (IBAN)",
        "account-lud16": "BTC peněženka (LUD16)",
        "account-nwc": "NWC (Nostr Wallet Connect)",
        "account-spark": "Spark Bitcoin L2",
        "account-thunder-bridge": "ThunderBridge",
        "account-cash-register": "Pokladna"
      },
      "gateway": {
        "ok": "Brána odpověděla, platby půjdou na {{address}}.",
        "unauthorized": "Brána token odmítla. Zkontrolujte token gateway.",
        "unreachable": "Bránu se nepodařilo kontaktovat. Zkontrolujte URL gateway.",
        "noWallet": "Brána token přijala, ale žádná peněženka částku neobslouží: {{detail}}",
        "refused": "Brána požadavek odmítla ({{status}}): {{detail}}",
        "unknown": "Bránu se nepodařilo ověřit: {{detail}}"
      },
      "seed-option": {
        "new": "Vygenerovat nový náhodný seed",
        "manual": "Použít existující seed"
      }
    }
  },
  "detail": {
    "tabs": {
      "sections": "Sekce",
      "detail": "Detail"
    },
    "fields": {
      "type": "Typ",
      "address": "Adresa"
    },
    "actions": {
      "edit": "Upravit",
      "delete": "Smazat"
    },
    "deleteDialog": {
      "title": "Smazat účet?",
      "description": "Tuto akci nelze vrátit zpět.",
      "confirm": "Smazat",
      "cancel": "Zrušit"
    }
  }
} as const;

export default locale;
