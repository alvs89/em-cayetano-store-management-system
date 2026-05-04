import React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Download, Calendar, TrendingUp, Package, AlertTriangle, RefreshCw, FileText } from 'lucide-react';
import { sortByNameAsc, sortByQuantityAsc, linearSearchAll } from '../utils/algorithms';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
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
    auditAction
  } = useData();
  const [reportType, setReportType] = useState('summary');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [reportPeriod, setReportPeriod] = useState('daily');
  const [selectedReportDate, setSelectedReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const reportDateInputRef = useRef(null);

  // Handle period change with refresh animation
  useEffect(() => {
    setIsRefreshing(true);
    const timer = setTimeout(() => {
      setIsRefreshing(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [reportPeriod, selectedReportDate]);

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
      const itemData = items.map(item => [item.id, item.name, item.category, item.quantity.toString(), item.status, formatDateTime(item.lastUpdated)]);
      autoTable(doc, {
        startY: startY + 20,
        head: [['ID', 'Item Name', 'Category', 'Quantity', 'Status', 'Last Updated']],
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
            cellWidth: 18
          },
          1: {
            cellWidth: 50
          },
          2: {
            cellWidth: 30
          },
          3: {
            cellWidth: 20
          },
          4: {
            cellWidth: 25
          },
          5: {
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
        const itemData = lowStockList.map(item => [item.id, item.name, item.category, item.quantity.toString(), item.status, formatDateTime(item.lastUpdated)]);
        autoTable(doc, {
          startY: startY + 15,
          head: [['ID', 'Item Name', 'Category', 'Quantity', 'Status', 'Last Updated']],
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
              cellWidth: 18
            },
            1: {
              cellWidth: 50
            },
            2: {
              cellWidth: 30
            },
            3: {
              cellWidth: 20
            },
            4: {
              cellWidth: 25
            },
            5: {
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
        const itemData = categoryItems.map(item => [item.id, item.name, item.quantity.toString(), item.status, formatDateTime(item.lastUpdated)]);
        autoTable(doc, {
          startY: currentY + 12,
          head: [['ID', 'Item Name', 'Quantity', 'Status', 'Last Updated']],
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
              cellWidth: 20
            },
            1: {
              cellWidth: 70
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
    } else if (reportType === 'movements') {
      const movements = getFilteredMovements();
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('STOCK MOVEMENT HISTORY', 20, startY);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Category Filter: ${selectedCategory === 'all' ? 'All Categories' : selectedCategory}`, 20, startY + 8);
      doc.text(`Total Movements: ${movements.length}`, 20, startY + 14);
      doc.text(`Stock In Units: ${stockInUnits}`, 20, startY + 20);
      doc.text(`Stock Out Units: ${stockOutUnits}`, 20, startY + 26);

      if (movements.length === 0) {
        doc.text('No stock movements found for this report period.', 20, startY + 38);
      } else {
        const movementData = movements.map(movement => [
          movement.id,
          formatDateTime(movement.createdAt),
          movement.itemName,
          movement.category,
          getMovementLabel(movement.action),
          movement.quantityChanged.toString(),
          `${movement.previousQuantity} -> ${movement.newQuantity}`,
          movement.actorName || 'System'
        ]);
        autoTable(doc, {
          startY: startY + 34,
          head: [['ID', 'Date', 'Item', 'Category', 'Action', 'Qty', 'Before -> After', 'Handled By']],
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

  const getMovementBadgeClass = action => {
    if (action === 'stock_out') return 'bg-red-100 text-red-700 hover:bg-red-100';
    if (action === 'initial_stock') return 'bg-blue-100 text-blue-700 hover:bg-blue-100';
    return 'bg-green-100 text-green-700 hover:bg-green-100';
  };

  const getFilteredMovements = () => {
    const filtered = selectedCategory === 'all'
      ? reportMovements
      : reportMovements.filter(movement => movement.category === selectedCategory);
    return [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  };
  return (
    <div className="reports-page min-h-screen bg-gray-50 p-4 md:p-8">
      <style>{`
        .reports-mobile-category-list { display: none; }
        .reports-movement-mobile-list { display: none; }

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
          .reports-mobile-category-card { min-width: 0; border: 1px solid #e2e8f0; border-radius: 14px; background: #ffffff; padding: 12px; box-shadow: 0 6px 14px rgba(15, 23, 42, 0.05); }
          .reports-mobile-category-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
          .reports-mobile-category-name { min-width: 0; overflow-wrap: anywhere; font-size: 15px; line-height: 1.25; font-weight: 800; color: #0f172a; }
          .reports-mobile-category-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
          .reports-mobile-category-stat { min-width: 0; border-radius: 12px; background: #f8fafc; padding: 10px; }
          .reports-mobile-category-stat span { display: block; margin-bottom: 4px; font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; }
          .reports-mobile-category-stat strong { display: block; font-size: 17px; line-height: 1.1; color: #0f172a; }
          .reports-data-card [data-card-content] { overflow-x: auto; }
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
                    <SelectItem value="movements">Stock Movement History</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(reportType === 'detailed' || reportType === 'movements') && (
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
        {(reportType === 'movements' ? [
          { label: 'Movements', value: getFilteredMovements().length, icon: <RefreshCw className="w-8 h-8 text-blue-500" />, color: 'border-l-blue-500' },
          { label: 'Stock In Units', value: stockInUnits, icon: <TrendingUp className="w-8 h-8 text-green-500" />, color: 'border-l-green-500' },
          { label: 'Stock Out Units', value: stockOutUnits, icon: <AlertTriangle className="w-8 h-8 text-red-500" />, color: stockOutUnits > 0 ? 'border-l-red-500' : 'border-l-slate-300' },
          { label: 'Categories', value: new Set(getFilteredMovements().map(movement => movement.category)).size, icon: <Package className="w-8 h-8 text-violet-500" />, color: 'border-l-violet-500' },
        ] : [
          { label: 'Total Items', value: totalItems, icon: <Package className="w-8 h-8 text-blue-500" />, color: 'border-l-blue-500' },
          { label: 'Total Units', value: totalQuantity, icon: <TrendingUp className="w-8 h-8 text-green-500" />, color: 'border-l-green-500' },
          { label: 'Categories', value: categories.length, icon: <Package className="w-8 h-8 text-violet-500" />, color: 'border-l-violet-500' },
          { label: 'Needs Attention', value: attentionItems, icon: <AlertTriangle className="w-8 h-8 text-red-500" />, color: attentionItems > 0 ? 'border-l-red-500' : 'border-l-slate-300' },
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
                            {cat.lowStock > 0 ? <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">{cat.lowStock}</Badge> : <Badge variant="outline">0</Badge>}
                          </TableCell>
                          <TableCell>
                            {cat.outOfStock > 0 ? <Badge variant="destructive">{cat.outOfStock}</Badge> : <Badge variant="outline">0</Badge>}
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
                        {cat.outOfStock > 0 ? <Badge variant="destructive">{cat.outOfStock} Out</Badge> : cat.lowStock > 0 ? <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">{cat.lowStock} Low</Badge> : <Badge variant="outline">Clear</Badge>}
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {getFilteredInventory().map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">{item.id}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>
                      <Badge className={item.status === 'In Stock' ? 'bg-green-100 text-green-700' : item.status === 'Low Stock' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(item.lastUpdated)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
              <div className="text-center py-8 text-slate-500">
                <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                <p>No low stock or out-of-stock items found for this report period.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getLowStockItems().map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-sm">{item.id}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell className="font-bold">{item.quantity}</TableCell>
                      <TableCell>
                        <Badge className={item.status === 'Low Stock' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(item.lastUpdated)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {reportType === 'category' && (
        <div className={`space-y-4 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
          {categories.map(category => {
            const categoryItems = reportInventory.filter(item => item.category === category);
            const categoryQty = categoryItems.reduce((sum, item) => sum + item.quantity, 0);
            const categoryLowStock = categoryItems.filter(item => item.status === 'Low Stock').length;
            const categoryOutOfStock = categoryItems.filter(item => item.status === 'Out of Stock').length;
            return (
              <Card key={category} className="reports-data-card">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>{category}</CardTitle>
                      <CardDescription>{categoryItems.length} items • {categoryQty} total units</CardDescription>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      {categoryLowStock > 0 && <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">{categoryLowStock} Low Stock</Badge>}
                      {categoryOutOfStock > 0 && <Badge variant="destructive">{categoryOutOfStock} Out of Stock</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Item Name</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryItems.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-sm">{item.id}</TableCell>
                          <TableCell>{item.name}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>
                            <Badge className={item.status === 'In Stock' ? 'bg-green-100 text-green-700' : item.status === 'Low Stock' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}>
                              {item.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDateTime(item.lastUpdated)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {reportType === 'movements' && (
        <Card className={`reports-data-card transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
          <CardHeader>
            <CardTitle>Stock Movement History</CardTitle>
            <CardDescription>
              {selectedCategory === 'all' ? 'All categories' : `${selectedCategory} category`} - {getFilteredMovements().length} movements
            </CardDescription>
          </CardHeader>
          <CardContent>
            {getFilteredMovements().length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <RefreshCw className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                <p>No stock movements found for this report period.</p>
              </div>
            ) : (
              <>
                <div className="reports-movement-desktop-table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Before</TableHead>
                        <TableHead>After</TableHead>
                        <TableHead>Handled By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getFilteredMovements().map(movement => (
                        <TableRow key={movement.id}>
                          <TableCell>{formatDateTime(movement.createdAt)}</TableCell>
                          <TableCell>{movement.itemName}</TableCell>
                          <TableCell>{movement.category}</TableCell>
                          <TableCell>
                            <Badge className={getMovementBadgeClass(movement.action)}>
                              {getMovementLabel(movement.action)}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-semibold">{movement.quantityChanged}</TableCell>
                          <TableCell>{movement.previousQuantity}</TableCell>
                          <TableCell>{movement.newQuantity}</TableCell>
                          <TableCell>{movement.actorName || 'System'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="reports-movement-mobile-list">
                  {getFilteredMovements().map(movement => (
                    <article key={movement.id} className="reports-movement-card">
                      <div className="reports-movement-top">
                        <div className="min-w-0">
                          <h4 className="reports-movement-name">{movement.itemName}</h4>
                          <p className="reports-movement-meta">{movement.category} • {formatDateTime(movement.createdAt)}</p>
                        </div>
                        <Badge className={`shrink-0 ${getMovementBadgeClass(movement.action)}`}>
                          {getMovementLabel(movement.action)}
                        </Badge>
                      </div>
                      <div className="reports-movement-stats">
                        <div className="reports-movement-stat">
                          <span>Qty</span>
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
                          <span>ID</span>
                          <strong>{movement.id}</strong>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
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
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "Detailed Inventory"), /*#__PURE__*/React.createElement(CardDescription, null, selectedCategory === 'all' ? 'All items' : `${selectedCategory} category`, " - ", getFilteredInventory().length, " items")), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement(Table, null, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, null, "ID"), /*#__PURE__*/React.createElement(TableHead, null, "Item Name"), /*#__PURE__*/React.createElement(TableHead, null, "Category"), /*#__PURE__*/React.createElement(TableHead, null, "Quantity"), /*#__PURE__*/React.createElement(TableHead, null, "Status"), /*#__PURE__*/React.createElement(TableHead, null, "Last Updated"))), /*#__PURE__*/React.createElement(TableBody, null, getFilteredInventory().map(item => /*#__PURE__*/React.createElement(TableRow, {
    key: item.id
  }, /*#__PURE__*/React.createElement(TableCell, {
    className: "font-mono text-sm"
  }, item.id), /*#__PURE__*/React.createElement(TableCell, null, item.name), /*#__PURE__*/React.createElement(TableCell, null, item.category), /*#__PURE__*/React.createElement(TableCell, null, item.quantity), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Badge, {
    className: item.status === 'In Stock' ? 'bg-green-100 text-green-700' : item.status === 'Low Stock' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
  }, item.status)), /*#__PURE__*/React.createElement(TableCell, null, formatDateTime(item.lastUpdated))))))), reportType === 'low-stock' && /*#__PURE__*/React.createElement(Card, {
    className: `transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "Low Stock Alert"), /*#__PURE__*/React.createElement(CardDescription, null, "Items requiring immediate attention - ", getLowStockItems().length, " items")), /*#__PURE__*/React.createElement(CardContent, null, getLowStockItems().length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "text-center py-8 text-slate-500"
  }, /*#__PURE__*/React.createElement(AlertTriangle, {
    className: "w-12 h-12 mx-auto mb-3 text-green-500"
  }), /*#__PURE__*/React.createElement("p", null, "No low stock items. All inventory levels are adequate.")) : /*#__PURE__*/React.createElement(Table, null, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, null, "ID"), /*#__PURE__*/React.createElement(TableHead, null, "Item Name"), /*#__PURE__*/React.createElement(TableHead, null, "Category"), /*#__PURE__*/React.createElement(TableHead, null, "Quantity"), /*#__PURE__*/React.createElement(TableHead, null, "Status"), /*#__PURE__*/React.createElement(TableHead, null, "Last Updated"))), /*#__PURE__*/React.createElement(TableBody, null, getLowStockItems().map(item => /*#__PURE__*/React.createElement(TableRow, {
    key: item.id
  }, /*#__PURE__*/React.createElement(TableCell, {
    className: "font-mono text-sm"
  }, item.id), /*#__PURE__*/React.createElement(TableCell, null, item.name), /*#__PURE__*/React.createElement(TableCell, null, item.category), /*#__PURE__*/React.createElement(TableCell, {
    className: "font-bold"
  }, item.quantity), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Badge, {
    className: item.status === 'Low Stock' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
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
    }, categoryLowStock, " Low Stock"))), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement(Table, null, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, null, "ID"), /*#__PURE__*/React.createElement(TableHead, null, "Item Name"), /*#__PURE__*/React.createElement(TableHead, null, "Quantity"), /*#__PURE__*/React.createElement(TableHead, null, "Status"), /*#__PURE__*/React.createElement(TableHead, null, "Last Updated"))), /*#__PURE__*/React.createElement(TableBody, null, categoryItems.map(item => /*#__PURE__*/React.createElement(TableRow, {
      key: item.id
    }, /*#__PURE__*/React.createElement(TableCell, {
      className: "font-mono text-sm"
    }, item.id), /*#__PURE__*/React.createElement(TableCell, null, item.name), /*#__PURE__*/React.createElement(TableCell, null, item.quantity), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Badge, {
      className: item.status === 'In Stock' ? 'bg-green-100 text-green-700' : item.status === 'Low Stock' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
    }, item.status)), /*#__PURE__*/React.createElement(TableCell, null, formatDateTime(item.lastUpdated))))))));
  }))));
}

