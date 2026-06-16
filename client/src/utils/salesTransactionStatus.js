// Shared sales-transaction status helpers keep Dashboard, Reports, Alerts, and
// Sales History aligned on what counts as a completed sale, refund, or pending payment.
export const getSalesTransactionType = sale =>
  String(sale?.transactionType ?? sale?.transaction_type ?? 'sale').trim().toLowerCase() || 'sale';

export const getSalesTransactionStatus = sale =>
  String(sale?.status ?? '').trim().toLowerCase();

export const isRefundSalesRecord = sale =>
  getSalesTransactionType(sale) === 'refund'
  || Number(sale?.totalAmount || 0) < 0
  || Number(sale?.totalQuantity || 0) < 0
  || (sale?.items || []).some(item => Number(item?.quantitySold || 0) < 0);

export const isPendingPaymentSale = sale =>
  getSalesTransactionStatus(sale) === 'pending_payment';

export const isCancelledSale = sale =>
  getSalesTransactionStatus(sale) === 'cancelled';

export const isCompletedSaleTransaction = sale =>
  getSalesTransactionStatus(sale) === 'completed'
  && getSalesTransactionType(sale) === 'sale'
  && !isRefundSalesRecord(sale);
