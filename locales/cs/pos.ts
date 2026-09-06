const locale = {
  "bill": {
    "currency": "Měna:",
    "each": "za kus",
    "noItemsInCart": "Žádné položky v košíku",
    "pay": "Zaplatit",
    "paid": "Účet {{label}} zaplacen",
    "charge": {
      "back": "Zpět k účtu",
      "cash": "Zaplaceno hotově",
      "cashOnly": "Zákazník platí hotově. Až peníze přijmete, potvrďte to tlačítkem níže.",
      "failed": "Platbu se nepodařilo připravit, zkuste to znovu",
      "fullscreen": "Na celou obrazovku",
      "missing": "Platba k tomuto účtu už neexistuje.",
      "noCodes": "Není nastavená žádná platební metoda. Nastavte ji v sekci Platby.",
      "retry": "Vystavit nový QR kód",
      "codes": {
        "bank": "QR platba",
        "lightning": "Lightning",
        "web": "Web"
      },
      "explain": {
        "expired": "Platnost QR kódu vypršela. Vystavte nový, nebo se vraťte k účtu.",
        "stopped": "Platba se přestala sledovat. Vystavte nový QR kód, nebo se vraťte k účtu."
      },
      "state": {
        "awaiting": "Čeká na zaplacení",
        "expired": "Vypršelo",
        "paid": "Zaplaceno",
        "stopped": "Zastaveno"
      }
    },
    "rate": "Kurz ({{unit}} za 1 {{billUnit}}):",
    "rate-pending": "čekám na kurz",
    "selectTable": "Vyberte stůl",
    "split": {
      "cancel": "Zrušit",
      "confirmMove": "Přesunout vybrané položky",
      "description": "Vyberte množství, které chcete přesunout na jiný účet, jiný stůl nebo zaplatit zvlášť.",
      "existingBillDialogTitle": "Přesunout vybrané položky na existující účet",
      "moveToAnotherTable": "Přesunout na jiný stůl",
      "moveToExistingBill": "Přesunout na existující účet",
      "moveToNewBill": "Přesunout na nový účet",
      "otherTableDialogTitle": "Přesunout vybrané položky na jiný stůl",
      "paySelected": "Zaplatit vybrané",
      "processing": "Zpracovávám...",
      "selectAnotherTable": "Vyberte stůl",
      "selectExistingBill": "Vyberte účet",
      "selectedItems": "Vybrané položky",
      "selectedQuantity": "Vybráno {{selected}} / {{total}}",
      "selectedTotal": "Vybrané celkem",
      "start": "Rozdělit účet",
      "title": "Rozdělení účtu"
    },
    "table-not-selected": "Stůl není vybrán",
    "tableQrCode": "QR kód tabulky",
    "totalPerCurrency": "Celkem ({{currency}}):",
    "total": "Celkový:"
  },
  "closed": {
    "bill": "Účet",
    "empty": "Zatím žádný zaplacený účet.",
    "open": "Zaplacené",
    "payment": "Platba",
    "title": "Zaplacené účty"
  },
  "items": {
    "newProduct": "Nový produkt",
    "searchItems": "Hledat položky...",
    "tabs": {
      "dial": "Klávesnice",
      "list": "Seznam položek"
    },
    "uncategorized": "Bez kategorie",
    "unknownItem": "Neznámá položka"
  },
  "tabs": {
    "deleteBill": {
      "cancel": "Zrušit",
      "confirm": "Smazat účet",
      "description": "Účet {{label}} obsahuje položky, které se smazáním ztratí.",
      "title": "Smazat účet?"
    },
    "deleted": "Účet {{label}} smazán",
    "newBill": "Nový účet",
    "undoDelete": "Vrátit"
  }
} as const;

export default locale;
