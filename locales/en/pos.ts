const locale = {
  "bill": {
    "currency": "Currency:",
    "each": "each",
    "noItemsInCart": "No items in cart",
    "pay": "Pay",
    "paid": "Bill {{label}} paid",
    "charge": {
      "back": "Back to bill",
      "cash": "Paid in cash",
      "cashOnly": "The customer pays in cash. Confirm it below once the money is in the till.",
      "failed": "The payment could not be prepared, try again",
      "fullscreen": "Fullscreen",
      "missing": "The payment for this bill no longer exists.",
      "noCodes": "No payment method is set up. Set one up in the Payments section.",
      "retry": "Issue a new QR code",
      "codes": {
        "bank": "Bank QR",
        "lightning": "Lightning",
        "web": "Web"
      },
      "explain": {
        "expired": "The QR code expired. Issue a new one or go back to the bill.",
        "stopped": "The payment is no longer watched. Issue a new QR code or go back to the bill."
      },
      "state": {
        "awaiting": "Waiting for payment",
        "expired": "Expired",
        "paid": "Paid",
        "stopped": "Stopped"
      }
    },
    "rate": "Rate ({{unit}} per 1 {{billUnit}}):",
    "selectTable": "Select a table",
    "split": {
      "cancel": "Cancel",
      "confirmMove": "Move selected items",
      "description": "Select quantities to move to another bill, another table, or pay separately.",
      "existingBillDialogTitle": "Move selected items to an existing bill",
      "moveToAnotherTable": "Move to another table",
      "moveToExistingBill": "Move to existing bill",
      "moveToNewBill": "Move to new bill",
      "otherTableDialogTitle": "Move selected items to another table",
      "paySelected": "Pay selected",
      "processing": "Processing...",
      "selectAnotherTable": "Select a table",
      "selectExistingBill": "Select a bill",
      "selectedItems": "Selected items",
      "selectedQuantity": "Selected {{selected}} / {{total}}",
      "selectedTotal": "Selected total",
      "start": "Split bill",
      "title": "Split bill"
    },
    "table-not-selected": "Table is not selected",
    "tableQrCode": "Table QR Code",
    "totalPerCurrency": "Total ({{currency}}):",
    "total": "Total:"
  },
  "closed": {
    "bill": "Bill",
    "empty": "No paid bill yet.",
    "open": "Paid bills",
    "payment": "Payment",
    "title": "Paid bills"
  },
  "items": {
    "newProduct": "New product",
    "searchItems": "Search items...",
    "tabs": {
      "dial": "Dial",
      "list": "Item list"
    },
    "uncategorized": "Uncategorized",
    "unknownItem": "Unknown"
  },
  "tabs": {
    "deleteBill": {
      "cancel": "Cancel",
      "confirm": "Delete bill",
      "description": "Bill {{label}} still has items, they will be lost.",
      "title": "Delete bill?"
    },
    "deleted": "Bill {{label}} deleted",
    "newBill": "New bill",
    "undoDelete": "Undo"
  }
} as const;

export default locale;
