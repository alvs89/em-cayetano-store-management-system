import React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Download, Calendar, TrendingUp, Package, AlertTriangle, RefreshCw, FileText, Info, Wallet, Tag } from 'lucide-react';
import { sortByNameAsc, sortByQuantityAsc, linearSearchAll } from '../utils/algorithms';
import { getStockStatusBadgeClass } from '../utils/statusStyles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { toast } from 'sonner';
import { useData } from './DataContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PageHeader } from './PageHeader';
import { formatDateTime } from '../utils/format';
export function ReportsModule({
  user
}) {
  const {
    inventory,
    stockMovements,
    salesTransactions,
    auditAction
  } = useData();
  const [reportType, setReportType] = useState('summary');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [reportPeriod, setReportPeriod] = useState('daily');
  const [selectedReportDate, setSelectedReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [finalOrderQuantities, setFinalOrderQuantities] = useState({});
  const [draftFinalOrderQuantities, setDraftFinalOrderQuantities] = useState({});
  const [isAdjustingFinalOrders, setIsAdjustingFinalOrders] = useState(false);
  const [showResetFinalOrdersDialog, setShowResetFinalOrdersDialog] = useState(false);
  const reportDateInputRef = useRef(null);

  // Handle period change with refresh animation
  useEffect(() => {
    setIsRefreshing(true);
    const timer = setTimeout(() => {
      setIsRefreshing(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [reportPeriod, selectedReportDate]);

  useEffect(() => {
    const applyTargetReport = ({ reportType: nextReportType, category = 'all' } = {}) => {
      if (!nextReportType) return;
      setReportType(nextReportType);
      setSelectedCategory(category || 'all');
    };

    const storedReportType = localStorage.getItem('reports_target_type');
    if (storedReportType) {
      applyTargetReport({
        reportType: storedReportType,
        category: localStorage.getItem('reports_target_category') || 'all'
      });
      localStorage.removeItem('reports_target_type');
      localStorage.removeItem('reports_target_category');
    }

    const handleTargetReport = event => {
      applyTargetReport(event.detail || {});
    };

    window.addEventListener('reports-target-view', handleTargetReport);
    return () => window.removeEventListener('reports-target-view', handleTargetReport);
  }, []);

  const getSelectedDate = () => {
    const [year, month, day] = selectedReportDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  };

  const getReportPeriodBounds = () => {
    const selectedDate = getSelectedDate();
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);

    if (reportPeriod === 'weekly') {
      start.setDate(selectedDate.getDate() - selectedDate.getDay());
      end.setTime(start.getTime());
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (reportPeriod === 'monthly') {
      start.setDate(1);
      end.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
    }

    return { start, end };
  };

  const isItemInReportPeriod = item => {
    const itemDate = new Date(item.lastUpdated);
    if (Number.isNaN(itemDate.getTime())) return false;
    const { start, end } = getReportPeriodBounds();
    return itemDate >= start && itemDate <= end;
  };

  const isMovementInReportPeriod = movement => {
    const movementDate = new Date(movement.createdAt);
    if (Number.isNaN(movementDate.getTime())) return false;
    const { start, end } = getReportPeriodBounds();
    return movementDate >= start && movementDate <= end;
  };

  const isSaleInReportPeriod = sale => {
    const saleDate = new Date(sale.createdAt);
    if (Number.isNaN(saleDate.getTime())) return false;
    const { start, end } = getReportPeriodBounds();
    return saleDate >= start && saleDate <= end;
  };

  const openReportDatePicker = () => {
    const input = reportDateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    } else {
      input.focus();
      input.click();
    }
  };

  // Get date range based on selected period
  const getDateRange = () => {
    const selectedDate = getSelectedDate();
    const options = {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    };
    if (reportPeriod === 'daily') {
      return selectedDate.toLocaleDateString('en-US', options);
    } else if (reportPeriod === 'weekly') {
      const startOfWeek = new Date(selectedDate);
      startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      const startMonth = startOfWeek.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric'
      });
      const endMonth = endOfWeek.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
      return `${startMonth} – ${endMonth}`;
    } else {
      return selectedDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      });
    }
  };

  // 🔍 Filter inventory by category using Linear Search Algorithm
  // Linear Search: O(n) - efficient for filtering with conditions
  const reportInventory = inventory.filter(isItemInReportPeriod);
  const reportMovements = (stockMovements || []).filter(isMovementInReportPeriod);
  const reportSalesTransactions = (salesTransactions || []).filter(isSaleInReportPeriod);

  const normalizeMovementName = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const getCurrentInventoryForMovement = movement =>
    inventory.find(item => String(item.id) === String(movement.inventoryId));

  const getMovementItemNameDetails = movement => {
    const historicalName = movement.itemName || 'Unknown item';
    const currentItem = getCurrentInventoryForMovement(movement);
    const currentName = currentItem?.name || '';
    const hasCurrentRename =
      currentName &&
      normalizeMovementName(currentName) !== normalizeMovementName(historicalName);

    return {
      historicalName,
      currentName: hasCurrentRename ? currentName : ''
    };
  };

  const formatMovementItemNameForExport = movement => {
    const { historicalName, currentName } = getMovementItemNameDetails(movement);
    return currentName ? `${historicalName} (Current name: ${currentName})` : historicalName;
  };

  // Calculate statistics from inventory records inside the selected report period
  const totalItems = reportInventory.length;
  const totalQuantity = reportInventory.reduce((sum, item) => sum + item.quantity, 0);
  const inStockItems = reportInventory.filter(item => item.status === 'In Stock').length;
  const lowStockItems = reportInventory.filter(item => item.status === 'Low Stock').length;
  const outOfStockItems = reportInventory.filter(item => item.status === 'Out of Stock').length;
  const attentionItems = lowStockItems + outOfStockItems;
  const stockInUnits = reportMovements
    .filter(movement => movement.action === 'stock_in' || movement.action === 'initial_stock')
    .reduce((sum, movement) => sum + movement.quantityChanged, 0);
  const stockOutUnits = reportMovements
    .filter(movement => movement.action === 'stock_out')
    .reduce((sum, movement) => sum + movement.quantityChanged, 0);
  // Get unique categories from the selected report period
  const categories = Array.from(new Set(reportInventory.map(item => item.category)));

  const getFilteredInventory = () => {
    if (selectedCategory === 'all') return sortByNameAsc(reportInventory);
    return sortByNameAsc(linearSearchAll(reportInventory, item => item.category === selectedCategory));
  };

  // 🔍 Get low stock items using Linear Search Algorithm
  // Finds items that need restocking attention, with out-of-stock first.
  const getLowStockItems = () => {
    const restockItems = linearSearchAll(reportInventory, item => item.status === 'Out of Stock' || item.status === 'Low Stock');
    return sortByQuantityAsc(restockItems).sort((a, b) => {
      const priority = {
        'Out of Stock': 0,
        'Low Stock': 1
      };
      return (priority[a.status] ?? 99) - (priority[b.status] ?? 99);
    });
  };

  const getDisplayItemCode = item => item?.itemCode || item?.id || 'N/A';

  const formatItemCount = value => `${Number(value || 0)} ${Number(value || 0) === 1 ? 'item' : 'items'}`;
  const formatUnitCount = value => `${Number(value || 0)} ${Number(value || 0) === 1 ? 'unit' : 'units'}`;
  const formatCurrency = value =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2
    }).format(Number(value || 0));

  const getSaleSubtotalForCategory = sale => {
    if (selectedCategory === 'all') {
      return Number(sale.subtotalAmount ?? sale.totalAmount ?? 0);
    }
    return (sale.items || [])
      .filter(item => item.category === selectedCategory)
      .reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  };

  const getFilteredSalesTransactions = () =>
    reportSalesTransactions.filter(sale => {
      if (sale.status === 'cancelled') return false;
      if (selectedCategory === 'all') return true;
      return (sale.items || []).some(item => item.category === selectedCategory);
    });

  const getSalesMovementRows = () =>
    getFilteredSalesTransactions().flatMap(sale =>
      (sale.items || [])
        .filter(item => selectedCategory === 'all' || item.category === selectedCategory)
        .map(item => ({
          id: `${sale.id}-${item.id}`,
          salesNumber: sale.salesNumber,
          createdAt: sale.createdAt,
          inventoryId: item.inventoryId,
          productId: item.productId,
          itemName: item.itemName,
          category: item.category,
          branch: item.branch || sale.branch,
          action: 'stock_out',
          reason: 'sales',
          quantityChanged: Number(item.quantitySold || 0),
          previousQuantity: Number(item.previousQuantity || 0),
          newQuantity: Number(item.newQuantity || 0),
          actorName: sale.soldByName || 'System',
          paymentMethod: sale.paymentMethod,
          saleStatus: sale.status
        }))
    ).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const getSalesMovementUnits = () =>
    getSalesMovementRows().reduce((sum, movement) => sum + Number(movement.quantityChanged || 0), 0);

  const getSalesFinancialSummary = () => {
    const sales = getFilteredSalesTransactions();

    return sales.reduce((summary, sale) => {
      const saleSubtotal = Number(sale.subtotalAmount ?? sale.totalAmount ?? 0);
      const includedSubtotal = getSaleSubtotalForCategory(sale);
      if (includedSubtotal <= 0) return summary;

      const discountAmount = Number(sale.discountAmount || 0);
      const discountShare = selectedCategory === 'all' || saleSubtotal <= 0
        ? discountAmount
        : Number(((includedSubtotal / saleSubtotal) * discountAmount).toFixed(2));
      const amountDue = Math.max(includedSubtotal - discountShare, 0);

      summary.transactionCount += 1;
      summary.subtotal += includedSubtotal;
      summary.discount += discountShare;
      summary.amountDue += amountDue;
      if (sale.paymentMethod === 'cash') {
        summary.cashTransactions += 1;
      } else if (sale.paymentMethod) {
        summary.nonCashTransactions += 1;
      }
      return summary;
    }, {
      transactionCount: 0,
      subtotal: 0,
      discount: 0,
      amountDue: 0,
      cashTransactions: 0,
      nonCashTransactions: 0
    });
  };

  const getSalesDemandForItem = item => reportSalesTransactions
    .filter(sale => sale.status !== 'cancelled')
    .flatMap(sale => sale.items || [])
    .filter(saleItem =>
      String(saleItem.inventoryId || '') === String(item.id || '') ||
      String(saleItem.productId || '') === String(item.productId || '')
    )
    .reduce((sum, saleItem) => sum + Number(saleItem.quantitySold || 0), 0);

  const getSupplierReorderGroups = () => {
    const reorderItems = getLowStockItems();
    const filteredItems = selectedCategory === 'all'
      ? reorderItems
      : reorderItems.filter(item => item.category === selectedCategory);
    const groups = filteredItems.reduce((acc, item) => {
      const supplier = item.supplierName?.trim() || 'Unassigned Supplier';
      if (!acc[supplier]) {
        acc[supplier] = {
          supplier,
          itemCount: 0,
          outOfStock: 0,
          lowStock: 0,
          suggestedUnits: 0,
          items: []
        };
      }
      const reorderPoint = Number(item.activeLowStockThreshold ?? item.recommendedReorderPoint ?? item.reorderLevel ?? 0);
      const reorderGap = Math.max(0, reorderPoint - Number(item.quantity || 0));
      const recentSalesDemand = getSalesDemandForItem(item);
      const suggestedQuantity = Math.max(reorderGap, recentSalesDemand);
      acc[supplier].itemCount += 1;
      acc[supplier].outOfStock += item.status === 'Out of Stock' ? 1 : 0;
      acc[supplier].lowStock += item.status === 'Low Stock' ? 1 : 0;
      acc[supplier].suggestedUnits += suggestedQuantity;
      acc[supplier].items.push({
        ...item,
        reorderPoint,
        reorderGap,
        recentSalesDemand,
        suggestedQuantity
      });
      return acc;
    }, {});

    return Object.values(groups).sort((a, b) => {
      if (b.outOfStock !== a.outOfStock) return b.outOfStock - a.outOfStock;
      return a.supplier.localeCompare(b.supplier);
    });
  };

  const getFinalOrderQuantity = item => {
    const savedValue = finalOrderQuantities[item.id];
    if (savedValue === undefined || savedValue === null || savedValue === '') {
      return Number(item.suggestedQuantity || 0);
    }
    const parsedValue = Number(savedValue);
    return Number.isFinite(parsedValue) ? parsedValue : Number(item.suggestedQuantity || 0);
  };

  const getSupplierFinalOrderTotal = group =>
    group.items.reduce((sum, item) => sum + getFinalOrderQuantity(item), 0);

  const hasFinalOrderAdjustments = Object.values(finalOrderQuantities).some(value => String(value || '').trim() !== '');
  const showFinalOrderColumn = isAdjustingFinalOrders || hasFinalOrderAdjustments;

  const startFinalOrderAdjustments = () => {
    setDraftFinalOrderQuantities(finalOrderQuantities);
    setIsAdjustingFinalOrders(true);
    toast.info('Enter final order quantities only for items you want to change.');
  };

  const handleFinalOrderQuantityChange = (item, value) => {
    const rawValue = String(value || '');
    if (/[^0-9]/.test(rawValue)) {
      toast.warning('Final order quantity must contain numbers only.', {
        id: 'final-order-numbers-only'
      });
    }
    if (rawValue.replace(/\D/g, '').length > 6) {
      toast.warning('Final order quantity cannot exceed 999999 units.', {
        id: 'final-order-maximum'
      });
    }
    const cleanValue = rawValue.replace(/\D/g, '').slice(0, 6);
    setDraftFinalOrderQuantities(prev => {
      const next = { ...prev };
      if (cleanValue === '') {
        delete next[item.id];
      } else {
        next[item.id] = cleanValue;
      }
      return next;
    });
  };

  const applyFinalOrderAdjustments = () => {
    const supplierGroups = getSupplierReorderGroups();
    const itemsById = new Map(supplierGroups.flatMap(group => group.items.map(item => [String(item.id), item])));
    const nextFinalOrderQuantities = {};
    let unchangedCount = 0;
    let skippedCount = 0;

    Object.entries(draftFinalOrderQuantities).forEach(([itemId, rawValue]) => {
      const item = itemsById.get(String(itemId));
      if (!item) return;

      const cleanValue = String(rawValue || '').replace(/\D/g, '').slice(0, 6);
      if (cleanValue === '') return;

      const finalQuantity = Number(cleanValue);
      const suggestedQuantity = Number(item.suggestedQuantity || 0);
      if (!Number.isInteger(finalQuantity) || finalQuantity < 0) return;

      if (finalQuantity === suggestedQuantity) {
        unchangedCount += 1;
        return;
      }

      if (finalQuantity === 0) skippedCount += 1;
      nextFinalOrderQuantities[item.id] = String(finalQuantity);
    });

    setFinalOrderQuantities(nextFinalOrderQuantities);
    setDraftFinalOrderQuantities({});
    setIsAdjustingFinalOrders(false);

    const adjustmentCount = Object.keys(nextFinalOrderQuantities).length;
    if (adjustmentCount === 0) {
      toast.info(unchangedCount > 0
        ? 'No final order changes were saved because the entered quantities matched the suggestions.'
        : 'No final order changes were saved. The report will use system suggestions.');
      return;
    }

    toast.success(`${adjustmentCount} final order ${adjustmentCount === 1 ? 'change was' : 'changes were'} applied${skippedCount > 0 ? `, including ${skippedCount} skipped reorder ${skippedCount === 1 ? 'item' : 'items'}` : ''}.`);
  };

  const cancelFinalOrderAdjustments = () => {
    setDraftFinalOrderQuantities({});
    setIsAdjustingFinalOrders(false);
    toast.info('Final order editing cancelled. No changes were applied.');
  };

  const resetFinalOrderQuantities = () => {
    setFinalOrderQuantities({});
    setDraftFinalOrderQuantities({});
    setIsAdjustingFinalOrders(false);
    setShowResetFinalOrdersDialog(false);
    toast.success('Reorder suggestions restored. Manual final order changes were cleared.');
  };

  // Get category summary
  const getCategorySummary = () => {
    const summary = categories.map(category => {
      const categoryItems = reportInventory.filter(item => item.category === category);
      const totalQty = categoryItems.reduce((sum, item) => sum + item.quantity, 0);
      const itemCount = categoryItems.length;
      const lowStock = categoryItems.filter(item => item.status === 'Low Stock').length;
      const outOfStock = categoryItems.filter(item => item.status === 'Out of Stock').length;
      return {
        category,
        itemCount,
        totalQty,
        lowStock,
        outOfStock
      };
    });
    return summary;
  };

  // Generate PDF Report
  const generatePDF = () => {
    const doc = new jsPDF();
    const currentDate = new Date().toLocaleDateString();
    const currentTime = new Date().toLocaleTimeString();

    // Set document properties
    doc.setProperties({
      title: `EMC ${reportType.toUpperCase()} Report`,
      subject: 'Inventory Management Report',
      author: user.fullName,
      creator: 'E.M. Cayetano Trading Inventory System'
    });

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('E.M. CAYETANO TRADING', 105, 20, {
      align: 'center'
    });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('INVENTORY MANAGEMENT SYSTEM', 105, 28, {
      align: 'center'
    });

    // Add line separator
    doc.setLineWidth(0.5);
    doc.line(20, 32, 190, 32);

    // Report Info
    doc.setFontSize(10);
    doc.text(`Report Type: ${reportType.toUpperCase().replace('-', ' ')}`, 20, 40);
    doc.text(`Report Period: ${reportPeriod.toUpperCase()} (${getDateRange()})`, 20, 46);
    doc.text(`Generated: ${currentDate} ${currentTime}`, 20, 52);
    doc.text(`Branch: ${user.branch}`, 20, 58);
    doc.text(`Generated by: ${user.fullName}`, 20, 64);
    doc.line(20, 68, 190, 68);
    let startY = 76;
    if (reportType === 'summary') {
      // Summary Statistics
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('INVENTORY SUMMARY', 20, startY);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Items: ${totalItems}`, 30, startY + 8);
      doc.text(`Total Units in Stock: ${totalQuantity}`, 30, startY + 14);
      doc.text(`In Stock: ${inStockItems}`, 30, startY + 20);
      doc.text(`Low Stock: ${lowStockItems}`, 30, startY + 26);
      doc.text(`Out of Stock: ${outOfStockItems}`, 30, startY + 32);

      // Category Breakdown Table
      doc.setFont('helvetica', 'bold');
      doc.text('CATEGORY BREAKDOWN', 20, startY + 45);
      const categoryData = getCategorySummary().map(cat => [cat.category, cat.itemCount.toString(), cat.totalQty.toString(), cat.lowStock.toString(), cat.outOfStock.toString()]);
      autoTable(doc, {
        startY: startY + 50,
        head: [['Category', 'Items', 'Total Units', 'Low Stock', 'Out of Stock']],
        body: categoryData,
        theme: 'striped',
        headStyles: {
          fillColor: [71, 85, 105],
          textColor: 255,
          fontStyle: 'bold'
        },
        styles: {
          fontSize: 9,
          cellPadding: 3
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        }
      });
    } else if (reportType === 'detailed') {
      const items = getFilteredInventory();
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('DETAILED INVENTORY REPORT', 20, startY);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Category Filter: ${selectedCategory === 'all' ? 'All Categories' : selectedCategory}`, 20, startY + 8);
      doc.text(`Total Items: ${items.length}`, 20, startY + 14);
      const itemData = items.map(item => [getDisplayItemCode(item), item.name, item.category, item.supplierName || 'Unassigned', item.quantity.toString(), item.status, formatDateTime(item.lastUpdated)]);
      autoTable(doc, {
        startY: startY + 20,
        head: [['Item Code', 'Item Name', 'Category', 'Supplier', 'Quantity', 'Status', 'Last Updated']],
        body: itemData,
        theme: 'striped',
        headStyles: {
          fillColor: [71, 85, 105],
          textColor: 255,
          fontStyle: 'bold'
        },
        styles: {
          fontSize: 8,
          cellPadding: 2
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        columnStyles: {
          0: {
            cellWidth: 28
          },
          1: {
            cellWidth: 42
          },
          2: {
            cellWidth: 30
          },
          3: {
            cellWidth: 28
          },
          4: {
            cellWidth: 18
          },
          5: {
            cellWidth: 24
          },
          6: {
            cellWidth: 27
          }
        }
      });
    } else if (reportType === 'low-stock') {
      const lowStockList = getLowStockItems();
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('LOW STOCK ALERT REPORT', 20, startY);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Restocking Attention Items: ${lowStockList.length}`, 20, startY + 8);
      if (lowStockList.length === 0) {
        doc.text('No low stock or out-of-stock items found for this report period.', 20, startY + 20);
      } else {
        const itemData = lowStockList.map(item => [getDisplayItemCode(item), item.name, item.category, item.supplierName || 'Unassigned', item.quantity.toString(), item.status, formatDateTime(item.lastUpdated)]);
        autoTable(doc, {
          startY: startY + 15,
          head: [['Item Code', 'Item Name', 'Category', 'Supplier', 'Quantity', 'Status', 'Last Updated']],
          body: itemData,
          theme: 'striped',
          headStyles: {
            fillColor: [220, 38, 38],
            textColor: 255,
            fontStyle: 'bold'
          },
          styles: {
            fontSize: 8,
            cellPadding: 2
          },
          alternateRowStyles: {
            fillColor: [254, 242, 242]
          },
          columnStyles: {
            0: {
              cellWidth: 28
            },
            1: {
              cellWidth: 42
            },
            2: {
              cellWidth: 30
            },
            3: {
              cellWidth: 28
            },
            4: {
              cellWidth: 18
            },
            5: {
              cellWidth: 24
            },
            6: {
              cellWidth: 27
            }
          }
        });
      }
    } else if (reportType === 'category') {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('CATEGORY SUMMARY REPORT', 20, startY);
      let currentY = startY + 10;
      getCategorySummary().forEach((cat, index) => {
        if (currentY > 250) {
          doc.addPage();
          currentY = 20;
        }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`CATEGORY: ${cat.category}`, 20, currentY);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Total Items: ${cat.itemCount} | Total Units: ${cat.totalQty} | Low Stock: ${cat.lowStock} | Out of Stock: ${cat.outOfStock}`, 20, currentY + 6);
        const categoryItems = reportInventory.filter(item => item.category === cat.category);
        const itemData = categoryItems.map(item => [getDisplayItemCode(item), item.name, item.supplierName || 'Unassigned', item.quantity.toString(), item.status, formatDateTime(item.lastUpdated)]);
        autoTable(doc, {
          startY: currentY + 12,
          head: [['Item Code', 'Item Name', 'Supplier', 'Quantity', 'Status', 'Last Updated']],
          body: itemData,
          theme: 'striped',
          headStyles: {
            fillColor: [71, 85, 105],
            textColor: 255,
            fontStyle: 'bold'
          },
          styles: {
            fontSize: 8,
            cellPadding: 2
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252]
          },
          columnStyles: {
            0: {
              cellWidth: 30
            },
            1: {
              cellWidth: 60
            },
            2: {
              cellWidth: 25
            },
            3: {
              cellWidth: 30
            },
            4: {
              cellWidth: 30
            }
          }
        });
        currentY = doc.lastAutoTable.finalY + 10;
      });
    } else if (reportType === 'supplier-reorder') {
      const supplierGroups = getSupplierReorderGroups();
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('SUPPLIER-BASED REORDER REPORT', 20, startY);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Category Filter: ${selectedCategory === 'all' ? 'All Categories' : selectedCategory}`, 20, startY + 8);
      doc.text(`Supplier Groups: ${supplierGroups.length}`, 20, startY + 14);

      if (supplierGroups.length === 0) {
        doc.text('No low-stock or out-of-stock items require supplier-based reordering for this report period.', 20, startY + 28);
      } else {
        let currentY = startY + 24;
        supplierGroups.forEach(group => {
          if (currentY > 245) {
            doc.addPage();
            currentY = 20;
          }
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text(`SUPPLIER: ${group.supplier}`, 20, currentY);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.text(
            `Items: ${group.itemCount} | Out of Stock: ${group.outOfStock} | Low Stock: ${group.lowStock} | Suggested Units: ${formatUnitCount(group.suggestedUnits)}${hasFinalOrderAdjustments ? ` | Final Order Units: ${formatUnitCount(getSupplierFinalOrderTotal(group))}` : ''}`,
            20,
            currentY + 6
          );
          autoTable(doc, {
            startY: currentY + 12,
            head: [[
              'Item Code',
              'Item',
              'Category',
              'Current',
              'Reorder Point',
              'Sales Demand',
              'Suggested Order',
              ...(hasFinalOrderAdjustments ? ['Final Order'] : []),
              'Status'
            ]],
            body: group.items.map(item => [
              getDisplayItemCode(item),
              item.name,
              item.category,
              String(item.quantity),
              String(item.reorderPoint),
              String(item.recentSalesDemand),
              String(item.suggestedQuantity),
              ...(hasFinalOrderAdjustments ? [String(getFinalOrderQuantity(item))] : []),
              item.status
            ]),
            theme: 'striped',
            headStyles: {
              fillColor: [71, 85, 105],
              textColor: 255,
              fontStyle: 'bold'
            },
            styles: {
              fontSize: 8,
              cellPadding: 2
            },
            alternateRowStyles: {
              fillColor: [248, 250, 252]
            }
          });
          currentY = doc.lastAutoTable.finalY + 12;
        });
      }
    } else if (reportType === 'movements' || reportType === 'sales-movements') {
      const isSalesMovementReport = reportType === 'sales-movements';
      const movements = isSalesMovementReport ? getSalesMovementRows() : getFilteredMovements({ salesOnly: false });
      const salesSummary = getSalesFinancialSummary();
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(isSalesMovementReport ? 'SALES-BASED STOCK MOVEMENT REPORT' : 'STOCK MOVEMENT HISTORY', 20, startY);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Category Filter: ${selectedCategory === 'all' ? 'All Categories' : selectedCategory}`, 20, startY + 8);
      doc.text(`${isSalesMovementReport ? 'Sales Stock Deductions' : 'Total Movements'}: ${movements.length}`, 20, startY + 14);
      if (isSalesMovementReport) {
        doc.text(`Quantity Sold: ${getSalesMovementUnits()}`, 20, startY + 20);
        doc.text(`Sales Transactions: ${salesSummary.transactionCount}`, 20, startY + 26);
        doc.text(`Subtotal: ${formatCurrency(salesSummary.subtotal)} | Discount: ${formatCurrency(salesSummary.discount)} | Amount Due: ${formatCurrency(salesSummary.amountDue)}`, 20, startY + 32);
      } else {
        doc.text(`Stock In Units: ${stockInUnits}`, 20, startY + 20);
        doc.text(`Stock Out Units: ${stockOutUnits}`, 20, startY + 26);
      }

      if (movements.length === 0) {
        doc.text(
          isSalesMovementReport
            ? 'No sales-based stock deductions found for this report period.'
            : 'No stock movements found for this report period.',
          20,
          isSalesMovementReport ? startY + 44 : startY + 38
        );
      } else {
        const movementData = movements.map(movement => [
          isSalesMovementReport ? movement.salesNumber || movement.id : movement.id,
          formatDateTime(movement.createdAt),
          formatMovementItemNameForExport(movement),
          movement.category,
          getMovementLabel(movement.action),
          getMovementReasonLabel(movement.reason),
          movement.quantityChanged.toString(),
          `${movement.previousQuantity} -> ${movement.newQuantity}`,
          movement.actorName || 'System'
        ]);
        autoTable(doc, {
          startY: isSalesMovementReport ? startY + 42 : startY + 34,
          head: [[isSalesMovementReport ? 'Sale No.' : 'Movement ID', 'Date', 'Item', 'Category', 'Action', 'Reason', isSalesMovementReport ? 'Qty Sold' : 'Qty', 'Before -> After', 'Handled By']],
          body: movementData,
          theme: 'striped',
          headStyles: {
            fillColor: [71, 85, 105],
            textColor: 255,
            fontStyle: 'bold'
          },
          styles: {
            fontSize: 7,
            cellPadding: 2
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252]
          }
        });
      }
    }

    // Footer on last page
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Page ${i} of ${pageCount}`, 105, 285, {
        align: 'center'
      });
      doc.text('E.M. Cayetano Trading - Inventory Management System', 105, 290, {
        align: 'center'
      });
    }

    // Save PDF
    doc.save(`EMC_${reportType}_report_${new Date().toISOString().split('T')[0]}.pdf`);
    auditAction?.('EXPORT_REPORT', {
      targetName: `${reportType.toUpperCase().replace('-', ' ')} report - ${reportPeriod.toUpperCase()} (${getDateRange()})`
    });
    toast.success('Report downloaded successfully!');
  };

  const getMovementLabel = action => {
    if (action === 'stock_in') return 'Stock In';
    if (action === 'stock_out') return 'Stock Out';
    if (action === 'initial_stock') return 'Initial Stock';
    return 'Adjustment';
  };

  const getMovementReasonLabel = reason => {
    const labels = {
      delivery_received: 'Delivery Received',
      returned_item: 'Returned Item',
      beginning_balance: 'Beginning Balance',
      sales: 'Sales',
      damaged: 'Damaged',
      expired: 'Expired',
      lost_missing: 'Lost/Missing',
      manual_adjustment: 'Manual Adjustment',
      branch_transfer: 'Branch Transfer',
      correction: 'Correction'
    };
    return labels[reason] || '-';
  };

  const getMovementBadgeClass = action => {
    if (action === 'stock_out') return 'bg-red-100 text-red-700 hover:bg-red-100';
    if (action === 'initial_stock') return 'bg-blue-100 text-blue-700 hover:bg-blue-100';
    return 'bg-green-100 text-green-700 hover:bg-green-100';
  };

  const getFilteredMovements = ({ salesOnly = false } = {}) => {
    const categoryFiltered = selectedCategory === 'all'
      ? reportMovements
      : reportMovements.filter(movement => movement.category === selectedCategory);
    const filtered = salesOnly
      ? categoryFiltered.filter(movement => movement.action === 'stock_out' && movement.reason === 'sales')
      : categoryFiltered;
    return [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  };

  const getUniqueMovementItemCount = ({ salesOnly = false } = {}) =>
    new Set(
      getFilteredMovements({ salesOnly })
        .map(movement => movement.inventoryId || movement.productId || movement.itemName)
        .filter(Boolean)
    ).size;

  const renderReportsEmptyState = ({ icon: Icon = FileText, title, message }) => (
    <div className="reports-empty-state">
      <div className="reports-empty-icon">
        <Icon className="h-7 w-7" />
      </div>
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );

  const renderReportHeaderTooltip = (label, message) => (
    <span className="reports-help-label">
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="reports-help-trigger"
            aria-label={`${label}: ${message}`}
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          sideOffset={8}
          hideArrow
          className="reports-help-content"
        >
          {message}
        </TooltipContent>
      </Tooltip>
    </span>
  );

  const getStatusCountBadgeClass = status =>
    status === 'Out of Stock'
      ? 'reports-count-badge reports-count-badge-out'
      : status === 'Low Stock'
        ? 'reports-count-badge reports-count-badge-low'
        : 'reports-count-badge reports-count-badge-clear';

  const renderInventoryMobileCard = (item, { showCategory = true, showSupplier = true } = {}) => (
    <article key={item.id} className="reports-record-card">
      <div className="reports-record-top">
        <div className="min-w-0">
          <p className="reports-record-code">{getDisplayItemCode(item)}</p>
          <h4 className="reports-record-name">{item.name}</h4>
          <p className="reports-record-meta">
            {[showCategory ? item.category : null, showSupplier ? item.supplierName || 'Unassigned supplier' : null]
              .filter(Boolean)
              .join(' - ')}
          </p>
        </div>
        <Badge className={`shrink-0 ${getStockStatusBadgeClass(item.status)}`}>
          {item.status}
        </Badge>
      </div>
      <div className="reports-record-grid">
        <div className="reports-record-stat">
          <span>Quantity</span>
          <strong>{item.quantity}</strong>
        </div>
        <div className="reports-record-stat">
          <span>Last Updated</span>
          <strong>{formatDateTime(item.lastUpdated)}</strong>
        </div>
      </div>
    </article>
  );

  const renderSupplierReorderMobileCard = item => (
    <article key={item.id} className="reports-record-card">
      <div className="reports-record-top">
        <div className="min-w-0">
          <p className="reports-record-code">{getDisplayItemCode(item)}</p>
          <h4 className="reports-record-name">{item.name}</h4>
          <p className="reports-record-meta">{item.category}</p>
        </div>
        <Badge className={`shrink-0 ${getStockStatusBadgeClass(item.status)}`}>
          {item.status}
        </Badge>
      </div>
      <div className="reports-record-grid reports-record-grid-four">
        <div className="reports-record-stat">
          <span>Current Stock</span>
          <strong>{item.quantity}</strong>
        </div>
        <div className="reports-record-stat">
          <span>Reorder Point</span>
          <strong>{item.reorderPoint}</strong>
        </div>
        <div className="reports-record-stat">
          <span>Sales Demand</span>
          <strong>{item.recentSalesDemand}</strong>
        </div>
        <div className="reports-record-stat">
          <span>Suggested Order</span>
          <strong>{item.suggestedQuantity}</strong>
        </div>
        {showFinalOrderColumn && (
          <div className="reports-record-stat reports-final-order-stat">
            <span>Final Order</span>
            <input
              className="reports-final-order-input"
              value={isAdjustingFinalOrders
                ? (draftFinalOrderQuantities[item.id] ?? '')
                : (finalOrderQuantities[item.id] ?? String(item.suggestedQuantity))}
              placeholder="0"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label={`Final order quantity for ${item.name}`}
              readOnly={!isAdjustingFinalOrders}
              onChange={event => handleFinalOrderQuantityChange(item, event.target.value)}
            />
          </div>
        )}
      </div>
    </article>
  );

  return (
    <div className="reports-page min-h-screen bg-gray-50 p-4 md:p-8">
      <style>{`
        .reports-mobile-category-list { display: none; }
        .reports-movement-mobile-list { display: none; }
        .reports-mobile-record-list { display: none; }
        .reports-desktop-table { display: block; }

        .reports-pos-summary {
          display: grid;
          grid-template-columns: minmax(220px, 0.8fr) minmax(0, 1.2fr);
          gap: 1rem;
          margin-bottom: 1rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.9rem;
          background: #f8fafc;
          padding: 1rem;
        }

        .reports-pos-summary-copy h3 {
          font-size: 1rem;
          line-height: 1.35;
          font-weight: 750;
          color: #0f172a;
        }

        .reports-pos-summary-copy p {
          margin-top: 0.35rem;
          font-size: 0.875rem;
          line-height: 1.5;
          color: #64748b;
        }

        .reports-pos-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.65rem;
        }

        .reports-pos-summary-item {
          min-width: 0;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          background: #ffffff;
          padding: 0.8rem;
        }

        .reports-pos-summary-item span {
          display: block;
          font-size: 0.72rem;
          line-height: 1.2;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
        }

        .reports-pos-summary-item strong {
          display: block;
          margin-top: 0.3rem;
          color: #0f172a;
          font-size: 0.95rem;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }

        .reports-help-label {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          max-width: 100%;
          white-space: nowrap;
        }

        .reports-help-trigger {
          appearance: none;
          display: inline-flex;
          height: 1.125rem;
          width: 1.125rem;
          min-height: 1.125rem;
          min-width: 1.125rem;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: #64748b;
          cursor: help;
          line-height: 1;
          padding: 0;
          transition: border-color 120ms ease, color 120ms ease, box-shadow 120ms ease;
        }

        .reports-help-trigger:hover,
        .reports-help-trigger:focus-visible {
          border-color: transparent;
          background: transparent;
          color: #64748b;
          outline: none;
          box-shadow: none;
        }

        .reports-help-trigger:focus,
        .reports-help-trigger:active,
        .reports-help-trigger[data-state='delayed-open'],
        .reports-help-trigger[data-state='instant-open'] {
          border-color: transparent;
          background: transparent;
          color: #64748b;
          outline: none;
          box-shadow: none;
        }

        .reports-help-content {
          z-index: 100;
          width: auto;
          max-width: min(17rem, calc(100vw - 2rem));
          border: 1px solid #cbd5e1;
          border-radius: 0.625rem;
          padding: 0.6rem 0.75rem;
          background: #ffffff;
          color: #334155;
          font-size: 0.75rem;
          line-height: 1.4;
          font-weight: 500;
          text-align: left;
          box-shadow: 0 10px 22px rgba(15, 23, 42, 0.12);
          white-space: normal;
        }

        .reports-help-content svg {
          display: none;
        }

        @media (hover: none), (pointer: coarse) {
          .reports-help-trigger,
          .reports-help-trigger:hover,
          .reports-help-trigger:focus,
          .reports-help-trigger:focus-visible {
            -webkit-tap-highlight-color: transparent;
            border-color: transparent;
            background: transparent;
            color: #64748b;
            box-shadow: none;
            outline: none;
          }

          .reports-help-trigger[data-state='delayed-open'],
          .reports-help-trigger[data-state='instant-open'] {
            border-color: transparent;
            background: transparent;
            color: #64748b;
            box-shadow: none;
            outline: none;
          }
        }

        .reports-empty-state {
          display: flex;
          min-height: 220px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1px dashed #cbd5e1;
          border-radius: 16px;
          background: #f8fafc;
          padding: 34px 22px;
          text-align: center;
          color: #64748b;
        }

        .reports-empty-icon {
          display: flex;
          height: 54px;
          width: 54px;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
          background: #ffffff;
          color: #475569;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
        }

        .reports-empty-state h3 {
          margin-top: 14px;
          color: #0f172a;
          font-size: 18px;
          font-weight: 750;
          line-height: 1.3;
        }

        .reports-empty-state p {
          margin-top: 6px;
          max-width: 560px;
          font-size: 14px;
          line-height: 1.55;
        }

        .reports-record-card {
          min-width: 0;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: #ffffff;
          padding: 12px;
          box-shadow: 0 6px 14px rgba(15, 23, 42, 0.05);
        }

        .reports-record-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }

        .reports-record-code {
          margin-bottom: 3px;
          color: #64748b;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          font-size: 12px;
          line-height: 1.2;
          overflow-wrap: anywhere;
        }

        .reports-record-name {
          color: #0f172a;
          font-size: 15px;
          font-weight: 800;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }

        .reports-record-meta {
          margin-top: 4px;
          color: #64748b;
          font-size: 12px;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }

        .reports-record-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .reports-record-stat {
          min-width: 0;
          border-radius: 12px;
          background: #f8fafc;
          padding: 9px;
        }

        .reports-record-stat span {
          display: block;
          margin-bottom: 4px;
          color: #64748b;
          font-size: 10px;
          font-weight: 800;
          line-height: 1.2;
          text-transform: uppercase;
        }

        .reports-record-stat strong {
          display: block;
          color: #0f172a;
          font-size: 14px;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }

        .reports-final-order-input {
          width: 6.5rem;
          max-width: 100%;
          min-height: 2.25rem;
          border: 1px solid #cbd5e1;
          border-radius: 0.625rem;
          background: #ffffff;
          padding: 0.45rem 0.65rem;
          color: #0f172a;
          font-size: 0.875rem;
          font-weight: 700;
          line-height: 1.2;
          outline: none;
          transition: border-color 140ms ease, box-shadow 140ms ease, background 140ms ease;
        }

        .reports-final-order-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
        }

        .reports-final-order-note {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          border: 1px solid #dbe3ef;
          border-radius: 0.875rem;
          background: #f8fafc;
          padding: 0.85rem 1rem;
          color: #475569;
          font-size: 0.875rem;
          line-height: 1.45;
        }

        .reports-final-order-note strong {
          color: #0f172a;
          font-weight: 750;
          white-space: nowrap;
        }

        .reports-final-order-note-text {
          display: flex;
          gap: 0.35rem;
          min-height: 2.5rem;
          flex: 1 1 auto;
          align-items: center;
          min-width: 0;
        }

        .reports-final-order-actions {
          display: flex;
          flex: 0 0 auto;
          justify-content: flex-end;
          margin-left: auto;
        }

        .reports-reset-confirm-dialog {
          width: min(100% - 2rem, 30rem);
          max-width: min(100% - 2rem, 30rem) !important;
          gap: 0.85rem;
          border: 2px solid #FFFF00;
          border-radius: 1rem;
          box-shadow: 0 18px 38px rgba(15, 23, 42, 0.18), 0 0 0 4px rgba(255, 255, 0, 0.16);
        }

        .reports-reset-confirm-dialog [data-slot="alert-dialog-header"] {
          gap: 0.5rem;
          padding: 1.25rem 1.25rem 0;
        }

        .reports-reset-confirm-dialog [data-slot="alert-dialog-title"] {
          color: #0f172a;
          font-size: 1.15rem;
          line-height: 1.2;
        }

        .reports-reset-confirm-dialog [data-slot="alert-dialog-description"] {
          color: #475569;
          font-size: 0.9rem;
          line-height: 1.45;
        }

        .reports-reset-confirm-dialog [data-slot="alert-dialog-footer"] {
          display: flex;
          flex-direction: row;
          gap: 0.6rem;
          justify-content: flex-end;
          padding: 0 1.25rem 1.25rem;
        }

        .reports-reset-confirm-dialog [data-slot="alert-dialog-footer"] > button {
          min-height: 2.5rem;
          min-width: 7.25rem;
        }

        .reports-reset-confirm-dialog [data-slot="alert-dialog-footer"] > button:hover,
        .reports-reset-confirm-dialog [data-slot="alert-dialog-footer"] > button:focus-visible {
          transform: none !important;
        }

        .reports-reset-confirm-submit {
          border: 1px solid #0f172a !important;
          background: #0f172a !important;
          color: #ffffff !important;
        }

        .reports-reset-confirm-submit:hover,
        .reports-reset-confirm-submit:focus-visible {
          border-color: #334155 !important;
          background: #334155 !important;
          color: #ffffff !important;
        }

        .reports-reset-confirm-icon {
          display: flex;
          height: 2.75rem;
          width: 2.75rem;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          border-radius: 0.9rem;
          background: #f1f5f9;
          color: #334155;
        }

        .reports-final-order-button-row {
          display: flex;
          gap: 0.5rem;
          justify-content: flex-end;
        }

        .reports-count-badge {
          border-radius: 999px;
          font-weight: 600;
          box-shadow: none;
        }

        .reports-count-badge-out,
        .reports-count-badge-out:hover {
          border-color: #be123c;
          background: #be123c;
          color: #ffffff;
        }

        .reports-count-badge-low,
        .reports-count-badge-low:hover {
          border-color: #eab308;
          background: #facc15;
          color: #422006;
        }

        .reports-count-badge-clear,
        .reports-count-badge-clear:hover {
          border-color: #e2e8f0;
          background: #f1f5f9;
          color: #334155;
        }

        @media (max-width: 767px) {
          .reports-page { padding: 14px; }
          .reports-page > .mb-8 { margin-bottom: 18px; }
          .reports-page > .mb-8 > .relative { border-radius: 18px; padding: 22px 18px; }
          .reports-page > .mb-8 .h-16.w-16 { height: 58px; width: 58px; border-radius: 16px; }
          .reports-page > .mb-8 .h-8.w-8 { height: 28px; width: 28px; }
          .reports-page > .mb-8 h1 { margin-bottom: 6px; font-size: 34px; line-height: 1.05; }
          .reports-page > .mb-8 p { font-size: 16px; line-height: 1.35; }

          .reports-config-card { margin-bottom: 16px; }
          .reports-config-card [data-reports-config-header] { padding: 18px 16px 0; }
          .reports-config-header {
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            width: 100%;
          }
          .reports-config-title {
            flex: 1 1 auto;
            min-width: 0;
          }
          .reports-config-title h3 { font-size: 18px; line-height: 1.25; }
          .reports-config-title p {
            margin-top: 4px;
            max-width: 100%;
            font-size: 14px;
            line-height: 1.35;
            overflow-wrap: anywhere;
          }
          .reports-export-button {
            min-height: 44px;
            width: 178px;
            max-width: 42%;
            flex: 0 0 auto;
            justify-content: center;
            border-radius: 12px;
            box-sizing: border-box;
            padding-left: 14px;
            padding-right: 14px;
          }
          .reports-config-card [data-reports-config-content] { padding: 0 16px 16px; }
          .reports-config-stack { gap: 0; }
          .reports-period-panel { padding: 14px; border-radius: 14px; }
          .reports-period-label { margin-bottom: 10px; }
          .reports-filter-row { gap: 10px; }
          .reports-page [data-reports-control],
          .reports-page [data-reports-date-pill] { min-height: 46px; border-radius: 12px; font-size: 14px; }
          .reports-date-picker-pill {
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            min-width: 0;
            cursor: pointer;
            transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
          }
          .reports-date-picker-pill:hover {
            border-color: #facc15;
            background: #ffffff;
          }
          .reports-date-picker-pill:focus-visible {
            outline: none;
            border-color: #f59e0b;
            box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18);
          }
          .reports-date-picker-input {
            width: 150px;
            min-height: 34px;
            flex: 0 0 auto;
            border: 1px solid #dbe3ef;
            border-radius: 10px;
            background: #f8fafc;
            padding: 0 10px;
            color: #172033;
            font-size: 13px;
            font-weight: 700;
            outline: none;
            transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
          }
          .reports-date-picker-input:focus {
            border-color: #f59e0b;
            background: #ffffff;
            box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18);
          }
          .reports-date-range-text {
            min-width: 0;
            flex: 1 1 auto;
            overflow-wrap: anywhere;
          }

          .reports-metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
          .reports-metric-card [data-reports-metric-content] { padding: 14px; }
          .reports-metric-card [data-reports-metric-row] { align-items: center; gap: 8px; }
          .reports-metric-card p:first-child { font-size: 12px; line-height: 1.2; }
          .reports-metric-card p:last-child { font-size: 26px; line-height: 1.05; }
          .reports-metric-card svg { height: 24px; width: 24px; }

          .reports-summary-card [data-reports-summary-header] { padding: 18px 16px 0; }
          .reports-summary-card [data-reports-summary-content] { padding: 0 16px 16px; }
          .reports-summary-card h3 { font-size: 18px; line-height: 1.25; }
          .reports-summary-card [data-reports-summary-header] p { margin-top: 4px; font-size: 14px; line-height: 1.35; }
          .reports-summary-stack { gap: 0; }
          .reports-summary-mini-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
          .reports-summary-mini-grid > div { padding: 12px; border-radius: 12px; }
          .reports-summary-mini-grid > div:last-child { grid-column: auto; }
          .reports-summary-mini-grid p:first-child { font-size: 12px; line-height: 1.2; white-space: nowrap; }
          .reports-summary-mini-grid p:last-child { font-size: 23px; line-height: 1.05; }

          .reports-category-title { margin-bottom: 10px; font-size: 18px; }
          .reports-category-table { display: none; }
          .reports-mobile-category-list { display: grid; gap: 10px; }
          .reports-empty-state { min-height: 190px; padding: 26px 16px; }
          .reports-empty-icon { height: 48px; width: 48px; border-radius: 14px; }
          .reports-empty-state h3 { font-size: 16px; }
          .reports-empty-state p { font-size: 13px; }
          .reports-mobile-category-card { min-width: 0; border: 1px solid #e2e8f0; border-radius: 14px; background: #ffffff; padding: 12px; box-shadow: 0 6px 14px rgba(15, 23, 42, 0.05); }
          .reports-mobile-category-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
          .reports-mobile-category-name { min-width: 0; overflow-wrap: anywhere; font-size: 15px; line-height: 1.25; font-weight: 800; color: #0f172a; }
          .reports-mobile-category-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
          .reports-mobile-category-stat { min-width: 0; border-radius: 12px; background: #f8fafc; padding: 10px; }
          .reports-mobile-category-stat span { display: block; margin-bottom: 4px; font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; }
          .reports-mobile-category-stat strong { display: block; font-size: 17px; line-height: 1.1; color: #0f172a; }
          .reports-final-order-input { width: 100%; min-height: 38px; }
          .reports-final-order-note {
            align-items: stretch;
            padding: 12px;
            font-size: 13px;
          }
          .reports-final-order-note-text {
            min-height: 0;
            align-items: flex-start;
            gap: 8px;
          }
          .reports-final-order-actions {
            width: 100%;
            margin-left: 0;
          }
          .reports-final-order-actions button {
            width: 100%;
            min-height: 42px;
          }
          .reports-final-order-button-row {
            width: 100%;
            flex-direction: row;
            gap: 8px;
          }
          .reports-final-order-button-row button {
            flex: 1 1 0;
            min-width: 0;
            padding-left: 10px;
            padding-right: 10px;
            white-space: nowrap;
          }
          .reports-data-card { gap: 0; }
          .reports-data-card [data-slot='card-header'] { padding-bottom: 8px; }
          .reports-data-card [data-slot='card-content'] { padding-top: 0; }
          .reports-desktop-table { display: none; }
          .reports-mobile-record-list { display: grid; gap: 10px; }
          .reports-data-card [data-card-content] { overflow-x: visible; }
          .reports-pos-summary {
            grid-template-columns: 1fr;
            gap: 10px;
            margin-bottom: 12px;
            padding: 12px;
            border-radius: 14px;
          }
          .reports-pos-summary-copy h3 { font-size: 15px; }
          .reports-pos-summary-copy p { font-size: 12px; line-height: 1.45; }
          .reports-pos-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }
          .reports-pos-summary-item {
            padding: 10px;
            border-radius: 12px;
          }
          .reports-pos-summary-item span { font-size: 10px; }
          .reports-pos-summary-item strong { font-size: 14px; }
          .reports-movement-desktop-table { display: none; }
          .reports-movement-mobile-list { display: grid; gap: 10px; }
          .reports-movement-card { min-width: 0; border: 1px solid #e2e8f0; border-radius: 14px; background: #ffffff; padding: 12px; box-shadow: 0 6px 14px rgba(15, 23, 42, 0.05); }
          .reports-movement-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
          .reports-movement-name { min-width: 0; overflow-wrap: anywhere; font-size: 15px; line-height: 1.25; font-weight: 700; color: #0f172a; }
          .reports-movement-meta { margin-top: 3px; font-size: 12px; color: #64748b; }
          .reports-movement-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
          .reports-movement-stat { min-width: 0; border-radius: 12px; background: #f8fafc; padding: 9px; }
          .reports-movement-stat span { display: block; margin-bottom: 4px; font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; }
          .reports-movement-stat strong { display: block; font-size: 15px; line-height: 1.1; color: #0f172a; overflow-wrap: anywhere; }
        }

        @media (max-width: 420px) {
          .reports-page { padding: 12px; }
          .reports-config-header { gap: 10px; }
          .reports-date-picker-pill {
            flex-direction: column;
            align-items: stretch;
          }
          .reports-date-picker-input {
            width: 100%;
          }
          .reports-export-button {
            width: 152px;
            max-width: 46%;
            font-size: 13px;
          }
          .reports-metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
          .reports-metric-card [data-reports-metric-content] { padding: 12px; }
          .reports-summary-mini-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
          .reports-summary-mini-grid > div { padding: 10px 8px; }
          .reports-summary-mini-grid p:first-child { font-size: 11px; }
          .reports-summary-mini-grid p:last-child { font-size: 21px; }
          .reports-summary-mini-grid > div:last-child { grid-column: auto; }
          .reports-final-order-button-row button {
            font-size: 13px;
          }
        }
      `}</style>

      <PageHeader
        title="Reports"
        subtitle="Generate comprehensive reports synchronized with real-time inventory data"
        icon={<FileText className="h-8 w-8" />}
      />

      <Card className="reports-config-card mb-6">
        <CardHeader data-reports-config-header>
          <div className="reports-config-header flex items-center justify-between">
            <div className="reports-config-title">
              <CardTitle>Report Configuration</CardTitle>
              <CardDescription>Select time period, report type and filters</CardDescription>
            </div>
            <Button
              onClick={generatePDF}
              className="reports-export-button bg-slate-700 hover:bg-slate-800 text-white font-semibold shadow-md transition-all duration-300"
            >
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent data-reports-config-content>
          <div className="reports-config-stack space-y-6">
            <div className="reports-period-panel bg-gradient-to-br from-yellow-50 to-orange-50 p-6 rounded-xl border-2 border-[#FFFF00]/30 shadow-sm">
              <div className="reports-period-label flex items-center gap-3 mb-3">
                <Calendar className="w-5 h-5 text-[#FF0000]" />
                <label className="font-semibold text-gray-900">Report Period:</label>
              </div>
              <div className="reports-filter-row flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <Select value={reportPeriod} onValueChange={value => setReportPeriod(value)}>
                    <SelectTrigger data-reports-control className="bg-white border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div
                  data-reports-date-pill
                  className="reports-date-picker-pill flex-1 flex bg-white px-4 py-2 rounded-lg border border-gray-300 shadow-sm"
                  role="button"
                  tabIndex={0}
                  onClick={openReportDatePicker}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openReportDatePicker();
                    }
                  }}
                  aria-label={`Open date picker for ${reportPeriod} report date`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {isRefreshing ? (
                      <RefreshCw className="w-4 h-4 shrink-0 text-[#FF0000] animate-spin" />
                    ) : (
                      <Calendar className="w-4 h-4 shrink-0 text-gray-600" />
                    )}
                    <span className={`reports-date-range-text text-sm text-gray-700 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
                      {getDateRange()}
                    </span>
                  </div>
                  <input
                    ref={reportDateInputRef}
                    className="reports-date-picker-input"
                    type="date"
                    value={selectedReportDate}
                    onClick={event => event.stopPropagation()}
                    onChange={event => setSelectedReportDate(event.target.value)}
                    aria-label={`Select ${reportPeriod} report date`}
                  />
                </div>
              </div>
            </div>

            <div className="reports-filter-row flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block text-gray-700">Report Type</label>
                <Select value={reportType} onValueChange={value => setReportType(value)}>
                  <SelectTrigger data-reports-control className="border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="summary">Summary</SelectItem>
                    <SelectItem value="detailed">Detailed Inventory</SelectItem>
                    <SelectItem value="low-stock">Low Stock Alert</SelectItem>
                    <SelectItem value="category">Category Analysis</SelectItem>
                    <SelectItem value="supplier-reorder">Supplier Reorder</SelectItem>
                    <SelectItem value="movements">Stock Movement History</SelectItem>
                    <SelectItem value="sales-movements">Sales-Based Stock Movement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(reportType === 'detailed' || reportType === 'movements' || reportType === 'sales-movements' || reportType === 'supplier-reorder') && (
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block text-gray-700">Filter by Category</label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger data-reports-control className="border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className={`reports-metric-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
        {(reportType === 'movements' || reportType === 'sales-movements' ? [
          { label: reportType === 'sales-movements' ? 'Sales Transactions' : 'Movements', value: reportType === 'sales-movements' ? getSalesFinancialSummary().transactionCount : getFilteredMovements({ salesOnly: false }).length, icon: <RefreshCw className="w-8 h-8 text-blue-500" />, color: 'border-l-blue-500' },
          { label: reportType === 'sales-movements' ? 'Quantity Sold' : 'Stock In Units', value: reportType === 'sales-movements' ? getSalesMovementUnits() : stockInUnits, icon: <TrendingUp className="w-8 h-8 text-green-500" />, color: 'border-l-green-500' },
          { label: reportType === 'sales-movements' ? 'Amount Due' : 'Stock Out Units', value: reportType === 'sales-movements' ? formatCurrency(getSalesFinancialSummary().amountDue) : stockOutUnits, icon: reportType === 'sales-movements' ? <Wallet className="w-8 h-8 text-amber-500" /> : <AlertTriangle className="w-8 h-8 text-red-500" />, color: reportType === 'sales-movements' ? 'border-l-amber-500' : stockOutUnits > 0 ? 'border-l-red-500' : 'border-l-slate-300' },
          { label: reportType === 'sales-movements' ? 'Discounts' : 'Categories', value: reportType === 'sales-movements' ? formatCurrency(getSalesFinancialSummary().discount) : new Set(getFilteredMovements({ salesOnly: false }).map(movement => movement.category)).size, icon: reportType === 'sales-movements' ? <Tag className="w-8 h-8 text-violet-500" /> : <Package className="w-8 h-8 text-violet-500" />, color: 'border-l-violet-500' },
        ] : reportType === 'supplier-reorder' ? [
          { label: 'Supplier Groups', value: getSupplierReorderGroups().length, icon: <Package className="w-8 h-8 text-blue-500" />, color: 'border-l-blue-500' },
          { label: 'Reorder Items', value: getSupplierReorderGroups().reduce((sum, group) => sum + group.itemCount, 0), icon: <AlertTriangle className="w-8 h-8 text-red-500" />, color: 'border-l-red-500' },
          { label: 'Out of Stock', value: getSupplierReorderGroups().reduce((sum, group) => sum + group.outOfStock, 0), icon: <AlertTriangle className="w-8 h-8 text-orange-500" />, color: 'border-l-orange-500' },
          { label: 'Suggested Units', value: getSupplierReorderGroups().reduce((sum, group) => sum + group.suggestedUnits, 0), icon: <TrendingUp className="w-8 h-8 text-green-500" />, color: 'border-l-green-500' },
        ] : [
          { label: 'Total Items', value: totalItems, icon: <Package className="w-8 h-8 text-blue-500" />, color: 'border-l-blue-500' },
          { label: 'Total Units', value: totalQuantity, icon: <TrendingUp className="w-8 h-8 text-green-500" />, color: 'border-l-green-500' },
          { label: 'Categories', value: categories.length, icon: <Package className="w-8 h-8 text-violet-500" />, color: 'border-l-violet-500' },
          { label: 'Stock Needs Attention', value: attentionItems, icon: <AlertTriangle className="w-8 h-8 text-red-500" />, color: attentionItems > 0 ? 'border-l-red-500' : 'border-l-slate-300' },
        ]).map(metric => (
          <Card key={metric.label} className={`reports-metric-card border-l-4 ${metric.color}`}>
            <CardContent className="pt-6" data-reports-metric-content>
              <div className="flex items-center justify-between" data-reports-metric-row>
                <div>
                  <p className="text-sm text-slate-600 mb-1">{metric.label}</p>
                  <p className="text-3xl font-bold text-slate-900">{metric.value}</p>
                </div>
                {metric.icon}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {reportType === 'summary' && (
        <Card className={`reports-summary-card transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
          <CardHeader data-reports-summary-header>
            <CardTitle>Stock Status Breakdown</CardTitle>
            <CardDescription>Current item distribution by stock condition</CardDescription>
          </CardHeader>
          <CardContent data-reports-summary-content>
            <div className="reports-summary-stack space-y-6">
              <div className="reports-summary-mini-grid grid grid-cols-3 gap-4">
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <p className="text-sm text-green-700 mb-1">In Stock</p>
                  <p className="text-2xl font-bold text-green-900">{inStockItems}</p>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                  <p className="text-sm text-yellow-700 mb-1">Low Stock</p>
                  <p className="text-2xl font-bold text-yellow-900">{lowStockItems}</p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <p className="text-sm text-red-700 mb-1">Out of Stock</p>
                  <p className="text-2xl font-bold text-red-900">{outOfStockItems}</p>
                </div>
              </div>

              <div className="reports-category-breakdown">
                <h3 className="reports-category-title font-semibold mb-3">Category Breakdown</h3>
                {getCategorySummary().length === 0 ? (
                  renderReportsEmptyState({
                    icon: Package,
                    title: 'No category breakdown available',
                    message: `No inventory items are available for the selected ${reportPeriod} period. Try another date range or add inventory records first.`
                  })
                ) : (
                  <>
                    <div className="reports-category-table">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Category</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Total Units</TableHead>
                            <TableHead>Low Stock</TableHead>
                            <TableHead>Out of Stock</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {getCategorySummary().map(cat => (
                            <TableRow key={cat.category}>
                              <TableCell className="font-medium">{cat.category}</TableCell>
                              <TableCell>{cat.itemCount}</TableCell>
                              <TableCell>{cat.totalQty}</TableCell>
                              <TableCell>
                                {cat.lowStock > 0 ? <Badge className={getStatusCountBadgeClass('Low Stock')}>{cat.lowStock}</Badge> : <Badge variant="outline">0</Badge>}
                              </TableCell>
                              <TableCell>
                                {cat.outOfStock > 0 ? <Badge className={getStatusCountBadgeClass('Out of Stock')}>{cat.outOfStock}</Badge> : <Badge variant="outline">0</Badge>}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="reports-mobile-category-list">
                      {getCategorySummary().map(cat => (
                        <article key={cat.category} className="reports-mobile-category-card">
                          <div className="reports-mobile-category-top">
                            <h4 className="reports-mobile-category-name">{cat.category}</h4>
                            {cat.outOfStock > 0 ? (
                              <Badge className={getStatusCountBadgeClass('Out of Stock')}>{cat.outOfStock} Out of Stock</Badge>
                            ) : cat.lowStock > 0 ? (
                              <Badge className={getStatusCountBadgeClass('Low Stock')}>{cat.lowStock} Low Stock</Badge>
                            ) : (
                              <Badge className={getStatusCountBadgeClass('Clear')}>Clear</Badge>
                            )}
                          </div>
                          <div className="reports-mobile-category-stats">
                            <div className="reports-mobile-category-stat">
                              <span>Items</span>
                              <strong>{cat.itemCount}</strong>
                            </div>
                            <div className="reports-mobile-category-stat">
                              <span>Total Units</span>
                              <strong>{cat.totalQty}</strong>
                            </div>
                            <div className="reports-mobile-category-stat">
                              <span>Low Stock</span>
                              <strong className="text-yellow-800">{cat.lowStock}</strong>
                            </div>
                            <div className="reports-mobile-category-stat">
                              <span>Out of Stock</span>
                              <strong className="text-red-800">{cat.outOfStock}</strong>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {reportType === 'detailed' && (
        <Card className={`reports-data-card transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
          <CardHeader>
            <CardTitle>Detailed Inventory</CardTitle>
            <CardDescription>{selectedCategory === 'all' ? 'All items' : `${selectedCategory} category`} - {getFilteredInventory().length} items</CardDescription>
          </CardHeader>
          <CardContent>
            {getFilteredInventory().length === 0 ? (
              renderReportsEmptyState({
                icon: Package,
                title: 'No inventory items found',
                message: `No active inventory records match the selected ${reportPeriod} period${selectedCategory === 'all' ? '' : ` and ${selectedCategory} category`}. Try changing the date range, report period, or category filter.`
              })
            ) : (
              <>
                <div className="reports-desktop-table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item Code</TableHead>
                        <TableHead>Item Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getFilteredInventory().map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-sm">{getDisplayItemCode(item)}</TableCell>
                          <TableCell>{item.name}</TableCell>
                          <TableCell>{item.category}</TableCell>
                          <TableCell>{item.supplierName || 'Unassigned'}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>
                            <Badge className={getStockStatusBadgeClass(item.status)}>
                              {item.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDateTime(item.lastUpdated)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="reports-mobile-record-list">
                  {getFilteredInventory().map(item => renderInventoryMobileCard(item))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {reportType === 'low-stock' && (
        <Card className={`reports-data-card transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
          <CardHeader>
            <CardTitle>Low Stock Alert</CardTitle>
            <CardDescription>Restocking attention: out of stock first, then low stock - {getLowStockItems().length} items</CardDescription>
          </CardHeader>
          <CardContent>
            {getLowStockItems().length === 0 ? (
              renderReportsEmptyState({
                icon: AlertTriangle,
                title: 'No low-stock items found',
                message: `No low-stock or out-of-stock items match the selected ${reportPeriod} period${selectedCategory === 'all' ? '' : ` and ${selectedCategory} category`}. Try another date range or category if you expected restocking items.`
              })
            ) : (
              <>
                <div className="reports-desktop-table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item Code</TableHead>
                        <TableHead>Item Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getLowStockItems().map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-sm">{getDisplayItemCode(item)}</TableCell>
                          <TableCell>{item.name}</TableCell>
                          <TableCell>{item.category}</TableCell>
                          <TableCell>{item.supplierName || 'Unassigned'}</TableCell>
                          <TableCell className="font-bold">{item.quantity}</TableCell>
                          <TableCell>
                            <Badge className={getStockStatusBadgeClass(item.status)}>
                              {item.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDateTime(item.lastUpdated)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="reports-mobile-record-list">
                  {getLowStockItems().map(item => renderInventoryMobileCard(item))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {reportType === 'supplier-reorder' && (
        <div className={`space-y-4 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
          {getSupplierReorderGroups().length === 0 ? (
            <Card className="reports-data-card">
              <CardContent>
                {renderReportsEmptyState({
                  icon: Package,
                  title: 'No supplier reorder items found',
                  message: `No low-stock or out-of-stock items require supplier-based reordering for the selected ${reportPeriod} period${selectedCategory === 'all' ? '' : ` and ${selectedCategory} category`}. Try another date range or review current inventory levels.`
                })}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="reports-final-order-note flex-col md:flex-row">
                <span className="reports-final-order-note-text">
                  <strong>Reorder review:</strong> Suggested Order is calculated by the system. Use Final Order only when the manager needs to adjust quantities before export.
                </span>
                <div className="reports-final-order-actions">
                  {!showFinalOrderColumn ? (
                    <Button type="button" variant="outline" onClick={startFinalOrderAdjustments}>
                      Adjust Final Orders
                    </Button>
                  ) : isAdjustingFinalOrders ? (
                    <div className="reports-final-order-button-row">
                      <Button type="button" variant="outline" onClick={cancelFinalOrderAdjustments}>
                        Cancel
                      </Button>
                      <Button type="button" onClick={applyFinalOrderAdjustments}>
                        Apply Final Orders
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" onClick={() => setShowResetFinalOrdersDialog(true)}>
                      Reset to Suggestions
                    </Button>
                  )}
                </div>
              </div>
              {getSupplierReorderGroups().map(group => (
              <Card key={group.supplier} className="reports-data-card">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>{group.supplier}</CardTitle>
                      <CardDescription>
                        {formatItemCount(group.itemCount)} needing reorder attention • Suggested total order: {formatUnitCount(group.suggestedUnits)}{hasFinalOrderAdjustments ? ` • Final order: ${formatUnitCount(getSupplierFinalOrderTotal(group))}` : ''}
                      </CardDescription>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      {group.outOfStock > 0 && <Badge className={getStatusCountBadgeClass('Out of Stock')}>{group.outOfStock} Out of Stock</Badge>}
                      {group.lowStock > 0 && <Badge className={getStatusCountBadgeClass('Low Stock')}>{group.lowStock} Low Stock</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="reports-desktop-table">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item Code</TableHead>
                          <TableHead>Item Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Current Stock</TableHead>
                          <TableHead>Reorder Point</TableHead>
                          <TableHead>
                            {renderReportHeaderTooltip(
                              'Sales Demand',
                              'Units sold during the selected report period. This helps estimate how much stock may be needed soon.'
                            )}
                          </TableHead>
                          <TableHead>
                            {renderReportHeaderTooltip(
                              'Suggested Order',
                              'Recommended quantity to order. It covers the stock shortage and recent sales demand.'
                            )}
                          </TableHead>
                          {showFinalOrderColumn && <TableHead>Final Order</TableHead>}
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.items.map(item => (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono text-sm">{getDisplayItemCode(item)}</TableCell>
                            <TableCell>{item.name}</TableCell>
                            <TableCell>{item.category}</TableCell>
                            <TableCell className="font-semibold">{item.quantity}</TableCell>
                            <TableCell>{item.reorderPoint}</TableCell>
                            <TableCell>{item.recentSalesDemand}</TableCell>
                            <TableCell className="font-semibold text-slate-950">{item.suggestedQuantity}</TableCell>
                            {showFinalOrderColumn && (
                              <TableCell>
                                <input
                                  className="reports-final-order-input"
                                  value={isAdjustingFinalOrders
                                    ? (draftFinalOrderQuantities[item.id] ?? '')
                                    : (finalOrderQuantities[item.id] ?? String(item.suggestedQuantity))}
                                  placeholder="0"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  aria-label={`Final order quantity for ${item.name}`}
                                  readOnly={!isAdjustingFinalOrders}
                                  onChange={event => handleFinalOrderQuantityChange(item, event.target.value)}
                                />
                              </TableCell>
                            )}
                            <TableCell>
                              <Badge className={getStockStatusBadgeClass(item.status)}>
                                {item.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="reports-mobile-record-list">
                    {group.items.map(item => renderSupplierReorderMobileCard(item))}
                  </div>
                </CardContent>
              </Card>
              ))}
            </>
          )}
        </div>
      )}

      {reportType === 'category' && (
        <div className={`space-y-4 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
          {categories.length === 0 ? (
            <Card className="reports-data-card">
              <CardContent>
                {renderReportsEmptyState({
                  icon: Package,
                  title: 'No category data found',
                  message: `No inventory items are available for category analysis in the selected ${reportPeriod} period. Try another date range or add inventory records first.`
                })}
              </CardContent>
            </Card>
          ) : categories.map(category => {
            const categoryItems = reportInventory.filter(item => item.category === category);
            const categoryQty = categoryItems.reduce((sum, item) => sum + item.quantity, 0);
            const categoryLowStock = categoryItems.filter(item => item.status === 'Low Stock').length;
            const categoryOutOfStock = categoryItems.filter(item => item.status === 'Out of Stock').length;
            return (
              <Card key={category} className="reports-data-card reports-category-analysis-card">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>{category}</CardTitle>
                      <CardDescription>{formatItemCount(categoryItems.length)} • {formatUnitCount(categoryQty)} total</CardDescription>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      {categoryLowStock > 0 && <Badge className={getStatusCountBadgeClass('Low Stock')}>{categoryLowStock} Low Stock</Badge>}
                      {categoryOutOfStock > 0 && <Badge className={getStatusCountBadgeClass('Out of Stock')}>{categoryOutOfStock} Out of Stock</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="reports-desktop-table">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item Code</TableHead>
                          <TableHead>Item Name</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Last Updated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoryItems.map(item => (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono text-sm">{getDisplayItemCode(item)}</TableCell>
                            <TableCell>{item.name}</TableCell>
                            <TableCell>{item.supplierName || 'Unassigned'}</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>
                              <Badge className={getStockStatusBadgeClass(item.status)}>
                                {item.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDateTime(item.lastUpdated)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="reports-mobile-record-list">
                    {categoryItems.map(item => renderInventoryMobileCard(item, { showCategory: false }))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(reportType === 'movements' || reportType === 'sales-movements') && (
        <Card className={`reports-data-card transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
          <CardHeader>
            <CardTitle>{reportType === 'sales-movements' ? 'Sales-Based Stock Movement Report' : 'Stock Movement History'}</CardTitle>
            <CardDescription>
              {selectedCategory === 'all' ? 'All categories' : `${selectedCategory} category`} - {reportType === 'sales-movements' ? getSalesMovementRows().length : getFilteredMovements({ salesOnly: false }).length} {reportType === 'sales-movements' ? 'completed sales deductions' : 'movements'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(reportType === 'sales-movements' ? getSalesMovementRows().length : getFilteredMovements({ salesOnly: false }).length) === 0 ? (
              renderReportsEmptyState({
                icon: RefreshCw,
                title: reportType === 'sales-movements' ? 'No sales deductions found' : 'No stock movements found',
                message: reportType === 'sales-movements'
                  ? `No sales-based inventory deductions match the selected ${reportPeriod} period${selectedCategory === 'all' ? '' : ` and ${selectedCategory} category`}. Try another date range or record a sale first.`
                  : `No stock in, stock out, or sales movement records match the selected ${reportPeriod} period${selectedCategory === 'all' ? '' : ` and ${selectedCategory} category`}. Try another date range or category filter.`
              })
            ) : (
              <>
                {reportType === 'sales-movements' && (
                  <div className="reports-pos-summary">
                    <div className="reports-pos-summary-copy">
                      <h3>Sales Payment Summary</h3>
                      <p>
                        {selectedCategory === 'all'
                          ? 'Totals from completed sales in the selected report period.'
                          : 'Category totals use matching sold item lines. Transaction discounts are shared proportionally for clearer reporting.'}
                      </p>
                    </div>
                    <div className="reports-pos-summary-grid">
                      <div className="reports-pos-summary-item">
                        <span>Subtotal</span>
                        <strong>{formatCurrency(getSalesFinancialSummary().subtotal)}</strong>
                      </div>
                      <div className="reports-pos-summary-item">
                        <span>Discount</span>
                        <strong>{formatCurrency(getSalesFinancialSummary().discount)}</strong>
                      </div>
                      <div className="reports-pos-summary-item">
                        <span>Amount Due</span>
                        <strong>{formatCurrency(getSalesFinancialSummary().amountDue)}</strong>
                      </div>
                      <div className="reports-pos-summary-item">
                        <span>Payment Mix</span>
                        <strong>{getSalesFinancialSummary().cashTransactions} cash, {getSalesFinancialSummary().nonCashTransactions} non-cash</strong>
                      </div>
                    </div>
                  </div>
                )}
                <div className="reports-movement-desktop-table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>{reportType === 'sales-movements' ? 'Qty Sold' : 'Qty'}</TableHead>
                        <TableHead>Before</TableHead>
                        <TableHead>After</TableHead>
                        <TableHead>Handled By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                  {(reportType === 'sales-movements' ? getSalesMovementRows() : getFilteredMovements({ salesOnly: false })).map(movement => {
                    const itemNameDetails = getMovementItemNameDetails(movement);
                    return (
                        <TableRow key={movement.id}>
                          <TableCell>{formatDateTime(movement.createdAt)}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium text-slate-900">{itemNameDetails.historicalName}</div>
                              {itemNameDetails.currentName && (
                                <div className="text-xs text-slate-500">Current name: {itemNameDetails.currentName}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{movement.category}</TableCell>
                          <TableCell>
                            <Badge className={getMovementBadgeClass(movement.action)}>
                              {getMovementLabel(movement.action)}
                            </Badge>
                          </TableCell>
                          <TableCell>{getMovementReasonLabel(movement.reason)}</TableCell>
                          <TableCell className="font-semibold">{movement.quantityChanged}</TableCell>
                          <TableCell>{movement.previousQuantity}</TableCell>
                          <TableCell>{movement.newQuantity}</TableCell>
                          <TableCell>{movement.actorName || 'System'}</TableCell>
                        </TableRow>
                    );
                  })}
                    </TableBody>
                  </Table>
                </div>
                <div className="reports-movement-mobile-list">
                  {(reportType === 'sales-movements' ? getSalesMovementRows() : getFilteredMovements({ salesOnly: false })).map(movement => {
                    const itemNameDetails = getMovementItemNameDetails(movement);
                    return (
                    <article key={movement.id} className="reports-movement-card">
                      <div className="reports-movement-top">
                        <div className="min-w-0">
                          <h4 className="reports-movement-name">{itemNameDetails.historicalName}</h4>
                          {itemNameDetails.currentName && (
                            <p className="reports-movement-meta">Current name: {itemNameDetails.currentName}</p>
                          )}
                          <p className="reports-movement-meta">{movement.category} • {formatDateTime(movement.createdAt)}</p>
                        </div>
                        <Badge className={`shrink-0 ${getMovementBadgeClass(movement.action)}`}>
                          {getMovementLabel(movement.action)}
                        </Badge>
                      </div>
                      <div className="reports-movement-stats">
                        <div className="reports-movement-stat">
                          <span>Reason</span>
                          <strong>{getMovementReasonLabel(movement.reason)}</strong>
                        </div>
                        <div className="reports-movement-stat">
                          <span>{reportType === 'sales-movements' ? 'Qty Sold' : 'Qty'}</span>
                          <strong>{movement.quantityChanged}</strong>
                        </div>
                        <div className="reports-movement-stat">
                          <span>Before</span>
                          <strong>{movement.previousQuantity}</strong>
                        </div>
                        <div className="reports-movement-stat">
                          <span>After</span>
                          <strong>{movement.newQuantity}</strong>
                        </div>
                        <div className="reports-movement-stat">
                          <span>Handled By</span>
                          <strong>{movement.actorName || 'System'}</strong>
                        </div>
                        <div className="reports-movement-stat">
                          <span>Branch</span>
                          <strong>{movement.branch}</strong>
                        </div>
                        <div className="reports-movement-stat">
                          <span>{reportType === 'sales-movements' ? 'Sale No.' : 'Movement ID'}</span>
                          <strong>{reportType === 'sales-movements' ? movement.salesNumber || movement.id : movement.id}</strong>
                        </div>
                      </div>
                    </article>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
      <AlertDialog open={showResetFinalOrdersDialog} onOpenChange={setShowResetFinalOrdersDialog}>
        <AlertDialogContent className="reports-reset-confirm-dialog bg-white p-0 shadow-lg">
          <AlertDialogHeader showBrand={false}>
            <div className="flex items-start gap-4">
              <div className="reports-reset-confirm-icon">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <AlertDialogTitle>Reset reorder suggestions?</AlertDialogTitle>
                <AlertDialogDescription className="mt-2">
                  This will clear all manual Final Order changes and return the Supplier Reorder report to the system suggested quantities. Inventory records and saved sales data will not change.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button type="button" onClick={resetFinalOrderQuantities} className="reports-reset-confirm-submit">
              Reset Suggestions
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
  return /*#__PURE__*/React.createElement("div", {
    className: "reports-page min-h-screen bg-gray-50 p-4 md:p-8"
  }, /*#__PURE__*/React.createElement("style", null, `
    .reports-mobile-category-list {
      display: none;
    }

    @media (max-width: 760px) {
      .reports-page {
        padding: 14px;
      }

      .reports-page > .mb-8 {
        margin-bottom: 18px;
      }

      .reports-page > .mb-8 > .relative {
        border-radius: 18px;
        padding: 22px 18px;
      }

      .reports-page > .mb-8 .h-16.w-16 {
        height: 58px;
        width: 58px;
        border-radius: 16px;
      }

      .reports-page > .mb-8 .h-8.w-8 {
        height: 28px;
        width: 28px;
      }

      .reports-page > .mb-8 h1 {
        margin-bottom: 6px;
        font-size: 34px;
        line-height: 1.05;
      }

      .reports-page > .mb-8 p {
        font-size: 16px;
        line-height: 1.35;
      }

      .reports-config-card {
        margin-bottom: 16px;
      }

      .reports-config-card [data-reports-config-header] {
        padding: 18px 16px 10px;
      }

      .reports-config-header {
        align-items: stretch;
        gap: 12px;
      }

      .reports-config-title [data-card-title] {
        font-size: 18px;
        line-height: 1.25;
      }

      .reports-config-title [data-card-description] {
        margin-top: 4px;
        font-size: 14px;
        line-height: 1.35;
      }

      .reports-export-button {
        min-height: 44px;
        width: 100%;
        justify-content: center;
        border-radius: 12px;
      }

      .reports-config-card [data-reports-config-content] {
        padding: 10px 16px 16px;
      }

      .reports-config-stack {
        gap: 14px;
      }

      .reports-period-panel {
        padding: 14px;
        border-radius: 14px;
      }

      .reports-period-label {
        margin-bottom: 10px;
      }

      .reports-filter-row {
        gap: 10px;
      }

      .reports-page [data-reports-control],
      .reports-page [data-reports-date-pill] {
        min-height: 46px;
        border-radius: 12px;
        font-size: 14px;
      }

      .reports-metric-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }

      .reports-metric-card [data-reports-metric-content] {
        padding: 14px;
      }

      .reports-metric-card [data-reports-metric-row] {
        align-items: center;
        gap: 8px;
      }

      .reports-metric-card p:first-child {
        font-size: 12px;
        line-height: 1.2;
      }

      .reports-metric-card p:last-child {
        font-size: 26px;
        line-height: 1.05;
      }

      .reports-metric-card svg {
        height: 24px;
        width: 24px;
      }

      .reports-summary-card [data-reports-summary-header] {
        padding: 18px 16px 10px;
      }

      .reports-summary-card [data-reports-summary-content] {
        padding: 10px 16px 16px;
      }

      .reports-summary-card [data-card-title] {
        font-size: 18px;
        line-height: 1.25;
      }

      .reports-summary-card [data-card-description] {
        margin-top: 4px;
        font-size: 14px;
        line-height: 1.35;
      }

      .reports-summary-stack {
        gap: 16px;
      }

      .reports-summary-mini-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .reports-summary-mini-grid > div {
        padding: 12px;
        border-radius: 12px;
      }

      .reports-summary-mini-grid > div:last-child {
        grid-column: 1 / -1;
      }

      .reports-summary-mini-grid p:first-child {
        font-size: 13px;
        line-height: 1.2;
      }

      .reports-summary-mini-grid p:last-child {
        font-size: 24px;
        line-height: 1.05;
      }

      .reports-category-title {
        margin-bottom: 10px;
        font-size: 18px;
      }

      .reports-category-table {
        display: none;
      }

      .reports-mobile-category-list {
        display: grid;
        gap: 10px;
      }

      .reports-mobile-category-card {
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        background: #ffffff;
        padding: 12px;
        box-shadow: 0 6px 14px rgba(15, 23, 42, 0.05);
        min-width: 0;
      }

      .reports-mobile-category-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
      }

      .reports-mobile-category-name {
        min-width: 0;
        overflow-wrap: anywhere;
        font-size: 15px;
        line-height: 1.25;
        font-weight: 800;
        color: #0f172a;
      }

      .reports-mobile-category-stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .reports-mobile-category-stat {
        min-width: 0;
        border-radius: 12px;
        background: #f8fafc;
        padding: 10px;
      }

      .reports-mobile-category-stat span {
        display: block;
        margin-bottom: 4px;
        font-size: 11px;
        font-weight: 800;
        color: #64748b;
        text-transform: uppercase;
      }

      .reports-mobile-category-stat strong {
        display: block;
        font-size: 17px;
        line-height: 1.1;
        color: #0f172a;
      }

      .reports-data-card [data-card-header] {
        padding: 18px 16px 10px;
      }

      .reports-data-card [data-card-content] {
        padding: 10px 16px 16px;
        overflow-x: auto;
      }
    }

    @media (max-width: 420px) {
      .reports-page {
        padding: 12px;
      }

      .reports-config-header {
        flex-direction: column;
      }

      .reports-metric-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .reports-metric-card [data-reports-metric-content] {
        padding: 12px;
      }

      .reports-summary-mini-grid {
        grid-template-columns: 1fr;
      }

      .reports-summary-mini-grid > div:last-child {
        grid-column: auto;
      }
    }
  `), /*#__PURE__*/React.createElement(PageHeader, {
    title: "Reports",
    subtitle: "Generate comprehensive reports synchronized with real-time inventory data",
    icon: /*#__PURE__*/React.createElement(FileText, {
      className: "h-8 w-8"
    })
  }), /*#__PURE__*/React.createElement(Card, {
    className: "reports-config-card mb-6"
  }, /*#__PURE__*/React.createElement(CardHeader, {
    "data-reports-config-header": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "reports-config-header flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", {
    className: "reports-config-title"
  }, /*#__PURE__*/React.createElement(CardTitle, null, "Report Configuration"), /*#__PURE__*/React.createElement(CardDescription, null, "Select time period, report type and filters")), /*#__PURE__*/React.createElement(Button, {
    onClick: generatePDF,
    className: "reports-export-button bg-slate-700 hover:bg-slate-800 text-white font-semibold shadow-md transition-all duration-300"
  }, /*#__PURE__*/React.createElement(Download, {
    className: "w-4 h-4 mr-2"
  }), "Export PDF"))), /*#__PURE__*/React.createElement(CardContent, {
    "data-reports-config-content": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "reports-config-stack space-y-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "reports-period-panel bg-gradient-to-br from-yellow-50 to-orange-50 p-6 rounded-xl border-2 border-[#FFFF00]/30 shadow-sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "reports-period-label flex items-center gap-3 mb-3"
  }, /*#__PURE__*/React.createElement(Calendar, {
    className: "w-5 h-5 text-[#FF0000]"
  }), /*#__PURE__*/React.createElement("label", {
    className: "font-semibold text-gray-900"
  }, "Report Period:")), /*#__PURE__*/React.createElement("div", {
    className: "reports-filter-row flex flex-col md:flex-row gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1"
  }, /*#__PURE__*/React.createElement(Select, {
    value: reportPeriod,
    onValueChange: value => setReportPeriod(value)
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    className: "bg-white border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm",
    "data-reports-control": true
  }, /*#__PURE__*/React.createElement(SelectValue, null)), /*#__PURE__*/React.createElement(SelectContent, null, /*#__PURE__*/React.createElement(SelectItem, {
    value: "daily"
  }, "Daily"), /*#__PURE__*/React.createElement(SelectItem, {
    value: "weekly"
  }, "Weekly"), /*#__PURE__*/React.createElement(SelectItem, {
    value: "monthly"
  }, "Monthly")))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-gray-300 shadow-sm",
    "data-reports-date-pill": true
  }, isRefreshing ? /*#__PURE__*/React.createElement(RefreshCw, {
    className: "w-4 h-4 text-[#FF0000] animate-spin"
  }) : /*#__PURE__*/React.createElement(Calendar, {
    className: "w-4 h-4 text-gray-600"
  }), /*#__PURE__*/React.createElement("span", {
    className: `text-sm text-gray-700 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`
  }, getDateRange())))), /*#__PURE__*/React.createElement("div", {
    className: "reports-filter-row flex flex-col md:flex-row gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-sm font-medium mb-2 block text-gray-700"
  }, "Report Type"), /*#__PURE__*/React.createElement(Select, {
    value: reportType,
    onValueChange: value => setReportType(value)
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    className: "border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00]",
    "data-reports-control": true
  }, /*#__PURE__*/React.createElement(SelectValue, null)), /*#__PURE__*/React.createElement(SelectContent, null, /*#__PURE__*/React.createElement(SelectItem, {
    value: "summary"
  }, "Summary"), /*#__PURE__*/React.createElement(SelectItem, {
    value: "detailed"
  }, "Detailed Inventory"), /*#__PURE__*/React.createElement(SelectItem, {
    value: "low-stock"
  }, "Low Stock Alert"), /*#__PURE__*/React.createElement(SelectItem, {
    value: "category"
  }, "Category Analysis")))), reportType === 'detailed' && /*#__PURE__*/React.createElement("div", {
    className: "flex-1"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-sm font-medium mb-2 block text-gray-700"
  }, "Filter by Category"), /*#__PURE__*/React.createElement(Select, {
    value: selectedCategory,
    onValueChange: setSelectedCategory
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    className: "border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00]",
    "data-reports-control": true
  }, /*#__PURE__*/React.createElement(SelectValue, null)), /*#__PURE__*/React.createElement(SelectContent, null, /*#__PURE__*/React.createElement(SelectItem, {
    value: "all"
  }, "All Categories"), categories.map(cat => /*#__PURE__*/React.createElement(SelectItem, {
    key: cat,
    value: cat
  }, cat))))))))), /*#__PURE__*/React.createElement("div", {
    className: `reports-metric-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`
  }, /*#__PURE__*/React.createElement(Card, {
    className: "reports-metric-card border-l-4 border-l-blue-500"
  }, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6",
    "data-reports-metric-content": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between",
    "data-reports-metric-row": true
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-1"
  }, "Total Items"), /*#__PURE__*/React.createElement("p", {
    className: "text-3xl font-bold text-slate-900"
  }, totalItems)), /*#__PURE__*/React.createElement(Package, {
    className: "w-8 h-8 text-blue-500"
  })))), /*#__PURE__*/React.createElement(Card, {
    className: "reports-metric-card border-l-4 border-l-green-500"
  }, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6",
    "data-reports-metric-content": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between",
    "data-reports-metric-row": true
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-1"
  }, "Total Units"), /*#__PURE__*/React.createElement("p", {
    className: "text-3xl font-bold text-slate-900"
  }, totalQuantity)), /*#__PURE__*/React.createElement(TrendingUp, {
    className: "w-8 h-8 text-green-500"
  })))), /*#__PURE__*/React.createElement(Card, {
    className: "reports-metric-card border-l-4 border-l-yellow-500"
  }, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6",
    "data-reports-metric-content": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between",
    "data-reports-metric-row": true
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-1"
  }, "Low Stock"), /*#__PURE__*/React.createElement("p", {
    className: "text-3xl font-bold text-slate-900"
  }, lowStockItems)), /*#__PURE__*/React.createElement(AlertTriangle, {
    className: "w-8 h-8 text-yellow-500"
  })))), /*#__PURE__*/React.createElement(Card, {
    className: "reports-metric-card border-l-4 border-l-red-500"
  }, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6",
    "data-reports-metric-content": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between",
    "data-reports-metric-row": true
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-1"
  }, "Out of Stock"), /*#__PURE__*/React.createElement("p", {
    className: "text-3xl font-bold text-slate-900"
  }, outOfStockItems)), /*#__PURE__*/React.createElement(AlertTriangle, {
    className: "w-8 h-8 text-red-500"
  }))))), reportType === 'summary' && /*#__PURE__*/React.createElement(Card, {
    className: `reports-summary-card transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`
  }, /*#__PURE__*/React.createElement(CardHeader, {
    "data-reports-summary-header": true
  }, /*#__PURE__*/React.createElement(CardTitle, null, "Inventory Summary"), /*#__PURE__*/React.createElement(CardDescription, null, "Overview of current inventory status")), /*#__PURE__*/React.createElement(CardContent, {
    "data-reports-summary-content": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "reports-summary-stack space-y-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "reports-summary-mini-grid grid grid-cols-3 gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-green-50 p-4 rounded-lg border border-green-200"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-green-700 mb-1"
  }, "In Stock"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-bold text-green-900"
  }, inStockItems)), /*#__PURE__*/React.createElement("div", {
    className: "bg-yellow-50 p-4 rounded-lg border border-yellow-200"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-yellow-700 mb-1"
  }, "Low Stock"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-bold text-yellow-900"
  }, lowStockItems)), /*#__PURE__*/React.createElement("div", {
    className: "bg-red-50 p-4 rounded-lg border border-red-200"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-red-700 mb-1"
  }, "Out of Stock"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-bold text-red-900"
  }, outOfStockItems))), /*#__PURE__*/React.createElement("div", {
    className: "reports-category-breakdown"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "reports-category-title font-semibold mb-3"
    }, "Category Breakdown"), /*#__PURE__*/React.createElement("div", {
    className: "reports-category-table"
  }, /*#__PURE__*/React.createElement(Table, null, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, null, "Category"), /*#__PURE__*/React.createElement(TableHead, null, "Items"), /*#__PURE__*/React.createElement(TableHead, null, "Total Units"), /*#__PURE__*/React.createElement(TableHead, null, "Low Stock"))), /*#__PURE__*/React.createElement(TableBody, null, getCategorySummary().map(cat => /*#__PURE__*/React.createElement(TableRow, {
    key: cat.category
  }, /*#__PURE__*/React.createElement(TableCell, {
    className: "font-medium"
  }, cat.category), /*#__PURE__*/React.createElement(TableCell, null, cat.itemCount), /*#__PURE__*/React.createElement(TableCell, null, cat.totalQty), /*#__PURE__*/React.createElement(TableCell, null, cat.lowStock > 0 ? /*#__PURE__*/React.createElement(Badge, {
    variant: "destructive"
  }, cat.lowStock) : /*#__PURE__*/React.createElement(Badge, {
    variant: "outline"
  }, "0"))))))))), /*#__PURE__*/React.createElement("div", {
    className: "reports-mobile-category-list"
  }, getCategorySummary().map(cat => /*#__PURE__*/React.createElement("article", {
    key: cat.category,
    className: "reports-mobile-category-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "reports-mobile-category-top"
  }, /*#__PURE__*/React.createElement("h4", {
    className: "reports-mobile-category-name"
  }, cat.category), cat.lowStock > 0 ? /*#__PURE__*/React.createElement(Badge, {
    variant: "destructive"
  }, cat.lowStock, " Low") : /*#__PURE__*/React.createElement(Badge, {
    variant: "outline"
  }, "0 Low")), /*#__PURE__*/React.createElement("div", {
    className: "reports-mobile-category-stats"
  }, /*#__PURE__*/React.createElement("div", {
    className: "reports-mobile-category-stat"
  }, /*#__PURE__*/React.createElement("span", null, "Items"), /*#__PURE__*/React.createElement("strong", null, cat.itemCount)), /*#__PURE__*/React.createElement("div", {
    className: "reports-mobile-category-stat"
  }, /*#__PURE__*/React.createElement("span", null, "Total Units"), /*#__PURE__*/React.createElement("strong", null, cat.totalQty))))))))), reportType === 'detailed' && /*#__PURE__*/React.createElement(Card, {
    className: `transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "Detailed Inventory"), /*#__PURE__*/React.createElement(CardDescription, null, selectedCategory === 'all' ? 'All items' : `${selectedCategory} category`, " - ", getFilteredInventory().length, " items")), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement(Table, null, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, null, "Item Code"), /*#__PURE__*/React.createElement(TableHead, null, "Item Name"), /*#__PURE__*/React.createElement(TableHead, null, "Category"), /*#__PURE__*/React.createElement(TableHead, null, "Quantity"), /*#__PURE__*/React.createElement(TableHead, null, "Status"), /*#__PURE__*/React.createElement(TableHead, null, "Last Updated"))), /*#__PURE__*/React.createElement(TableBody, null, getFilteredInventory().map(item => /*#__PURE__*/React.createElement(TableRow, {
    key: item.id
  }, /*#__PURE__*/React.createElement(TableCell, {
    className: "font-mono text-sm"
  }, getDisplayItemCode(item)), /*#__PURE__*/React.createElement(TableCell, null, item.name), /*#__PURE__*/React.createElement(TableCell, null, item.category), /*#__PURE__*/React.createElement(TableCell, null, item.quantity), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Badge, {
    className: getStockStatusBadgeClass(item.status)
  }, item.status)), /*#__PURE__*/React.createElement(TableCell, null, formatDateTime(item.lastUpdated))))))), reportType === 'low-stock' && /*#__PURE__*/React.createElement(Card, {
    className: `transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "Low Stock Alert"), /*#__PURE__*/React.createElement(CardDescription, null, "Items requiring immediate attention - ", getLowStockItems().length, " items")), /*#__PURE__*/React.createElement(CardContent, null, getLowStockItems().length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "text-center py-8 text-slate-500"
  }, /*#__PURE__*/React.createElement(AlertTriangle, {
    className: "w-12 h-12 mx-auto mb-3 text-green-500"
  }), /*#__PURE__*/React.createElement("p", null, "No low stock items. All inventory levels are adequate.")) : /*#__PURE__*/React.createElement(Table, null, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, null, "Item Code"), /*#__PURE__*/React.createElement(TableHead, null, "Item Name"), /*#__PURE__*/React.createElement(TableHead, null, "Category"), /*#__PURE__*/React.createElement(TableHead, null, "Quantity"), /*#__PURE__*/React.createElement(TableHead, null, "Status"), /*#__PURE__*/React.createElement(TableHead, null, "Last Updated"))), /*#__PURE__*/React.createElement(TableBody, null, getLowStockItems().map(item => /*#__PURE__*/React.createElement(TableRow, {
    key: item.id
  }, /*#__PURE__*/React.createElement(TableCell, {
    className: "font-mono text-sm"
  }, getDisplayItemCode(item)), /*#__PURE__*/React.createElement(TableCell, null, item.name), /*#__PURE__*/React.createElement(TableCell, null, item.category), /*#__PURE__*/React.createElement(TableCell, {
    className: "font-bold"
  }, item.quantity), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Badge, {
    className: getStockStatusBadgeClass(item.status)
  }, item.status)), /*#__PURE__*/React.createElement(TableCell, null, formatDateTime(item.lastUpdated))))))), reportType === 'category' && /*#__PURE__*/React.createElement("div", {
    className: `space-y-4 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`
  }, categories.map(category => {
    const categoryItems = inventory.filter(item => item.category === category);
    const categoryQty = categoryItems.reduce((sum, item) => sum + item.quantity, 0);
    const categoryLowStock = categoryItems.filter(item => item.status === 'Low Stock' || item.status === 'Out of Stock').length;
    return /*#__PURE__*/React.createElement(Card, {
      key: category
    }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(CardTitle, null, category), /*#__PURE__*/React.createElement(CardDescription, null, categoryItems.length, " items \u2022 ", categoryQty, " total units")), categoryLowStock > 0 && /*#__PURE__*/React.createElement(Badge, {
      variant: "destructive"
    }, categoryLowStock, " Low Stock"))), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement(Table, null, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, null, "Item Code"), /*#__PURE__*/React.createElement(TableHead, null, "Item Name"), /*#__PURE__*/React.createElement(TableHead, null, "Quantity"), /*#__PURE__*/React.createElement(TableHead, null, "Status"), /*#__PURE__*/React.createElement(TableHead, null, "Last Updated"))), /*#__PURE__*/React.createElement(TableBody, null, categoryItems.map(item => /*#__PURE__*/React.createElement(TableRow, {
      key: item.id
    }, /*#__PURE__*/React.createElement(TableCell, {
      className: "font-mono text-sm"
    }, getDisplayItemCode(item)), /*#__PURE__*/React.createElement(TableCell, null, item.name), /*#__PURE__*/React.createElement(TableCell, null, item.quantity), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Badge, {
      className: getStockStatusBadgeClass(item.status)
    }, item.status)), /*#__PURE__*/React.createElement(TableCell, null, formatDateTime(item.lastUpdated))))))));
  }))));
}

