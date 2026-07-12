const PdfPrinter = require('pdfmake');

// PDF's standard 14 fonts need no embedded TTF/font-file dependency — used
// instead of Roboto since amounts are rendered as "Rs. 123.00" (no ₹ glyph
// requiring Unicode font embedding).
const fonts = {
  Helvetica: {
    normal:      'Helvetica',
    bold:        'Helvetica-Bold',
    italics:     'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

const rupee = (n) => `Rs. ${Number(n || 0).toFixed(2)}`;

/**
 * Builds a pdfmake document definition for one invoice. `scope` is either
 * the whole Order (store-owned / no vendor split) or a single vendor's
 * SubOrder — both share enough shape (items, subtotal, shippingCost, tax,
 * giftWrapTotal) to use one template. `seller` carries the GSTIN/name/address
 * to print in the "Sold By" block — the store itself for Order-level
 * invoices, or the vendor for SubOrder-level ones.
 */
function buildInvoiceDocDefinition({ order, scope, seller, customer, storeSettings }) {
  const items = scope.items || [];
  const showGst = seller?.gstEnabled !== false;

  const itemRows = items.map(i => {
    const lineBase = i.price * i.quantity;
    const giftWrapLine = i.giftWrap?.selected ? i.giftWrap.price * i.quantity : 0;
    return [
      { text: i.name, style: 'tableCell' },
      { text: i.sku || '-', style: 'tableCell' },
      { text: String(i.quantity), style: 'tableCell', alignment: 'center' },
      { text: rupee(i.price), style: 'tableCell', alignment: 'right' },
      ...(showGst ? [{ text: `${i.gstRate || 0}%`, style: 'tableCell', alignment: 'right' }] : []),
      ...(showGst ? [{ text: rupee(i.gstAmount), style: 'tableCell', alignment: 'right' }] : []),
      { text: rupee(lineBase + giftWrapLine + (i.gstAmount || 0)), style: 'tableCell', alignment: 'right' },
    ];
  });

  const tableHeader = [
    { text: 'Item', style: 'tableHeader' },
    { text: 'SKU', style: 'tableHeader' },
    { text: 'Qty', style: 'tableHeader', alignment: 'center' },
    { text: 'Price', style: 'tableHeader', alignment: 'right' },
    ...(showGst ? [{ text: 'GST %', style: 'tableHeader', alignment: 'right' }] : []),
    ...(showGst ? [{ text: 'GST Amt', style: 'tableHeader', alignment: 'right' }] : []),
    { text: 'Line Total', style: 'tableHeader', alignment: 'right' },
  ];

  const widths = showGst
    ? ['*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto']
    : ['*', 'auto', 'auto', 'auto', 'auto'];

  const summaryRows = [
    ['Subtotal', rupee(scope.subtotal)],
    ...(scope.giftWrapTotal ? [['Gift Wrapping', rupee(scope.giftWrapTotal)]] : []),
    ...(order.bundleSavings ? [['Bundle Savings', `- ${rupee(order.bundleSavings)}`]] : []),
    ...(showGst ? [['GST', rupee(scope.tax ?? order.tax)]] : []),
    ['Shipping', scope.shippingCost > 0 ? rupee(scope.shippingCost) : 'Free'],
    ...(order.discount ? [['Coupon Discount', `- ${rupee(order.discount)}`]] : []),
    ['Total', rupee(scope.total ?? order.total)],
  ];

  return {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    defaultStyle: { font: 'Helvetica', fontSize: 9 },
    content: [
      {
        columns: [
          { text: storeSettings?.general?.storeName || 'Store', style: 'brand' },
          { text: `INVOICE\n${order.invoiceNumber || order.orderNumber}`, style: 'invoiceTitle', alignment: 'right' },
        ],
      },
      { text: `Order Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`, margin: [0, 4, 0, 0] },
      { text: `Order #: ${order.orderNumber}${scope.subNumber ? `  |  Sub-Order #: ${scope.subNumber}` : ''}`, margin: [0, 2, 0, 12] },

      {
        columns: [
          {
            width: '50%',
            stack: [
              { text: 'Sold By', style: 'sectionHeader' },
              { text: seller?.storeName || seller?.name || storeSettings?.general?.storeName || 'Store' },
              ...(showGst && seller?.gstin ? [{ text: `GSTIN: ${seller.gstin}` }] : []),
              ...(seller?.pickupAddress?.line1 ? [{ text: [seller.pickupAddress.line1, seller.pickupAddress.city, seller.pickupAddress.state, seller.pickupAddress.pincode].filter(Boolean).join(', ') }] : []),
            ],
          },
          {
            width: '50%',
            stack: [
              { text: 'Billed To', style: 'sectionHeader' },
              { text: order.shippingAddress?.name || customer?.name || 'Customer' },
              { text: [order.shippingAddress?.line1, order.shippingAddress?.line2].filter(Boolean).join(', ') },
              { text: [order.shippingAddress?.city, order.shippingAddress?.state, order.shippingAddress?.pincode].filter(Boolean).join(', ') },
              ...(order.shippingAddress?.phone ? [{ text: `Phone: ${order.shippingAddress.phone}` }] : []),
            ],
          },
        ],
        margin: [0, 0, 0, 16],
      },

      {
        table: { headerRows: 1, widths, body: [tableHeader, ...itemRows] },
        layout: {
          fillColor: (rowIndex) => (rowIndex === 0 ? '#f3f4f6' : null),
          hLineColor: () => '#e5e7eb',
          vLineColor: () => '#e5e7eb',
        },
      },

      {
        margin: [0, 16, 0, 0],
        columns: [
          { width: '*', text: '' },
          {
            width: 220,
            table: {
              widths: ['*', 'auto'],
              body: summaryRows.map(([label, value], idx) => [
                { text: label, style: idx === summaryRows.length - 1 ? 'totalLabel' : 'summaryLabel' },
                { text: value, alignment: 'right', style: idx === summaryRows.length - 1 ? 'totalValue' : 'summaryValue' },
              ]),
            },
            layout: 'noBorders',
          },
        ],
      },

      { text: 'This is a computer-generated invoice and does not require a signature.', style: 'footer', margin: [0, 30, 0, 0] },
    ],
    styles: {
      brand:         { fontSize: 16, bold: true },
      invoiceTitle:  { fontSize: 12, bold: true },
      sectionHeader: { fontSize: 9, bold: true, color: '#6b7280', margin: [0, 0, 0, 4] },
      tableHeader:   { fontSize: 8.5, bold: true },
      tableCell:     { fontSize: 8.5 },
      summaryLabel:  { fontSize: 9 },
      summaryValue:  { fontSize: 9 },
      totalLabel:    { fontSize: 11, bold: true, margin: [0, 6, 0, 0] },
      totalValue:    { fontSize: 11, bold: true, margin: [0, 6, 0, 0] },
      footer:        { fontSize: 7.5, italics: true, color: '#9ca3af', alignment: 'center' },
    },
  };
}

/**
 * Renders a PDF document definition to a Buffer.
 */
function renderPdfBuffer(docDefinition) {
  return new Promise((resolve, reject) => {
    try {
      const printer = new PdfPrinter(fonts);
      const doc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    } catch (err) { reject(err); }
  });
}

module.exports = { buildInvoiceDocDefinition, renderPdfBuffer };
