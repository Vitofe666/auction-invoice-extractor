// Quick test for Xero tax type mapping
const mapToXeroBill = (data) => {
  const xeroLineItems = [];

  // Process auction lots with account code 3200 (Cost of Sales)
  if (data.auction_lots && data.auction_lots.length > 0) {
    data.auction_lots.forEach(lot => {
      console.log(`Processing auction lot ${lot.lot_number}: ${lot.item_description}`);
      console.log(`Account Code: 3200, Tax Type: NONE, Amount: ${lot.total}`);
      
      xeroLineItems.push({
        Description: `Lot ${lot.lot_number}: ${lot.item_description}`,
        Quantity: 1,
        UnitAmount: parseFloat(lot.total) || 0,
        AccountCode: "3200", // Cost of Sales
        TaxType: "NONE"      // UK Zero-rated supply
      });
    });
  }

  // Process auction premium with account code 3200
  if (data.auction_premium) {
    console.log(`Processing auction premium: ${data.auction_premium}`);
    console.log(`Account Code: 3200, Tax Type: NONE, Amount: ${data.auction_premium}`);
    
    xeroLineItems.push({
      Description: "Auction Premium",
      Quantity: 1,
      UnitAmount: parseFloat(data.auction_premium) || 0,
      AccountCode: "3200", // Cost of Sales
      TaxType: "NONE"      // UK Zero-rated supply
    });
  }

  // Process other charges with VAT if applicable
  if (data.other_charges && data.other_charges.length > 0) {
    data.other_charges.forEach(charge => {
      console.log(`Processing other charge: ${charge.description}`);
      console.log(`Account Code: 4200, Tax Type: INPUT2, Amount: ${charge.amount}`);
      
      xeroLineItems.push({
        Description: charge.description,
        Quantity: 1,
        UnitAmount: parseFloat(charge.amount) || 0,
        AccountCode: "4200", // General Expenses
        TaxType: "INPUT2"    // UK VAT on Purchases
      });
    });
  }

  return {
    Type: "ACCPAY",
    Contact: {
      Name: data.supplier_name || "Unknown Supplier"
    },
    Date: data.invoice_date || new Date().toISOString().split('T')[0],
    DueDate: data.due_date || new Date().toISOString().split('T')[0],
    Reference: data.invoice_number || "",
    LineItems: xeroLineItems
  };
};

// Test data similar to what we might receive
const testData = {
  supplier_name: "Test Auction House",
  invoice_number: "INV-12345",
  invoice_date: "2024-01-15",
  due_date: "2024-02-15",
  auction_lots: [
    {
      lot_number: "101",
      item_description: "Gold Ring",
      total: "500.00"
    },
    {
      lot_number: "102", 
      item_description: "Silver Necklace",
      total: "250.00"
    }
  ],
  auction_premium: "150.00",
  other_charges: [
    {
      description: "Insurance",
      amount: "25.00"
    }
  ]
};

console.log("Testing Xero bill mapping with new tax types...");
console.log("=".repeat(50));

const xeroBill = mapToXeroBill(testData);

console.log("\nGenerated Xero Bill:");
console.log(JSON.stringify(xeroBill, null, 2));

console.log("\nTax Type Summary:");
xeroBill.LineItems.forEach((item, index) => {
  console.log(`Line ${index + 1}: ${item.Description} - Account: ${item.AccountCode}, Tax: ${item.TaxType}, Amount: ${item.UnitAmount}`);
});