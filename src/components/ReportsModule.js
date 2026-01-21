import React from 'react';
import { useState, useEffect } from 'react';
import { Download, Calendar, TrendingUp, Package, AlertTriangle, RefreshCw } from 'lucide-react';
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
export function ReportsModule({
  user
}) {
  const {
    inventory
  } = useData();
  const [reportType, setReportType] = useState('summary');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [reportPeriod, setReportPeriod] = useState('daily');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Calculate real-time statistics from inventory
  const totalItems = inventory.length;
  const totalQuantity = inventory.reduce((sum, item) => sum + item.quantity, 0);
  const inStockItems = inventory.filter(item => item.status === 'In Stock').length;
  const lowStockItems = inventory.filter(item => item.status === 'Low Stock').length;
  const outOfStockItems = inventory.filter(item => item.status === 'Out of Stock').length;

  // Get unique categories
  const categories = Array.from(new Set(inventory.map(item => item.category)));

  // Handle period change with refresh animation
  useEffect(() => {
    setIsRefreshing(true);
    const timer = setTimeout(() => {
      setIsRefreshing(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [reportPeriod]);

  // Get date range based on selected period
  const getDateRange = () => {
    const today = new Date();
    const options = {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    };
    if (reportPeriod === 'daily') {
      return today.toLocaleDateString('en-US', options);
    } else if (reportPeriod === 'weekly') {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
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
      return today.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      });
    }
  };

  // 🔍 Filter inventory by category using Linear Search Algorithm
  // Linear Search: O(n) - efficient for filtering with conditions
  const getFilteredInventory = () => {
    if (selectedCategory === 'all') return sortByNameAsc(inventory);
    return sortByNameAsc(linearSearchAll(inventory, item => item.category === selectedCategory));
  };

  // 🔍 Get low stock items using Linear Search Algorithm
  // Finds all items that need attention (low stock or out of stock)
  const getLowStockItems = () => {
    return sortByQuantityAsc(linearSearchAll(inventory, item => item.status === 'Low Stock' || item.status === 'Out of Stock'));
  };

  // Get category summary
  const getCategorySummary = () => {
    const summary = categories.map(category => {
      const categoryItems = inventory.filter(item => item.category === category);
      const totalQty = categoryItems.reduce((sum, item) => sum + item.quantity, 0);
      const itemCount = categoryItems.length;
      const lowStock = categoryItems.filter(item => item.status === 'Low Stock' || item.status === 'Out of Stock').length;
      return {
        category,
        itemCount,
        totalQty,
        lowStock
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
      const categoryData = getCategorySummary().map(cat => [cat.category, cat.itemCount.toString(), cat.totalQty.toString(), cat.lowStock.toString()]);
      autoTable(doc, {
        startY: startY + 50,
        head: [['Category', 'Items', 'Total Units', 'Low Stock Alerts']],
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
      const itemData = items.map(item => [item.id, item.name, item.category, item.quantity.toString(), item.status, item.lastUpdated]);
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
      doc.text(`Critical Items: ${lowStockList.length}`, 20, startY + 8);
      if (lowStockList.length === 0) {
        doc.text('No low stock items. All inventory levels are adequate.', 20, startY + 20);
      } else {
        const itemData = lowStockList.map(item => [item.id, item.name, item.category, item.quantity.toString(), item.status, item.lastUpdated]);
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
        doc.text(`Total Items: ${cat.itemCount} | Total Units: ${cat.totalQty} | Low Stock Alerts: ${cat.lowStock}`, 20, currentY + 6);
        const categoryItems = inventory.filter(item => item.category === cat.category);
        const itemData = categoryItems.map(item => [item.id, item.name, item.quantity.toString(), item.status, item.lastUpdated]);
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
    toast.success('Report downloaded successfully!');
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-gray-50 p-8"
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Reports",
    subtitle: "Generate comprehensive reports synchronized with real-time inventory data"
  }), /*#__PURE__*/React.createElement(Card, {
    className: "mb-6"
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(CardTitle, null, "Report Configuration"), /*#__PURE__*/React.createElement(CardDescription, null, "Select time period, report type and filters")), /*#__PURE__*/React.createElement(Button, {
    onClick: generatePDF,
    className: "bg-slate-700 hover:bg-slate-800 text-white font-semibold shadow-md transition-all duration-300"
  }, /*#__PURE__*/React.createElement(Download, {
    className: "w-4 h-4 mr-2"
  }), "Export PDF"))), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement("div", {
    className: "space-y-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-gradient-to-br from-yellow-50 to-orange-50 p-6 rounded-xl border-2 border-[#FFFF00]/30 shadow-sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 mb-3"
  }, /*#__PURE__*/React.createElement(Calendar, {
    className: "w-5 h-5 text-[#FF0000]"
  }), /*#__PURE__*/React.createElement("label", {
    className: "font-semibold text-gray-900"
  }, "Report Period:")), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col md:flex-row gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1"
  }, /*#__PURE__*/React.createElement(Select, {
    value: reportPeriod,
    onValueChange: value => setReportPeriod(value)
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    className: "bg-white border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
  }, /*#__PURE__*/React.createElement(SelectValue, null)), /*#__PURE__*/React.createElement(SelectContent, null, /*#__PURE__*/React.createElement(SelectItem, {
    value: "daily"
  }, "Daily"), /*#__PURE__*/React.createElement(SelectItem, {
    value: "weekly"
  }, "Weekly"), /*#__PURE__*/React.createElement(SelectItem, {
    value: "monthly"
  }, "Monthly")))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-gray-300 shadow-sm"
  }, isRefreshing ? /*#__PURE__*/React.createElement(RefreshCw, {
    className: "w-4 h-4 text-[#FF0000] animate-spin"
  }) : /*#__PURE__*/React.createElement(Calendar, {
    className: "w-4 h-4 text-gray-600"
  }), /*#__PURE__*/React.createElement("span", {
    className: `text-sm text-gray-700 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`
  }, getDateRange())))), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col md:flex-row gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-sm font-medium mb-2 block text-gray-700"
  }, "Report Type"), /*#__PURE__*/React.createElement(Select, {
    value: reportType,
    onValueChange: value => setReportType(value)
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    className: "border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00]"
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
    className: "border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00]"
  }, /*#__PURE__*/React.createElement(SelectValue, null)), /*#__PURE__*/React.createElement(SelectContent, null, /*#__PURE__*/React.createElement(SelectItem, {
    value: "all"
  }, "All Categories"), categories.map(cat => /*#__PURE__*/React.createElement(SelectItem, {
    key: cat,
    value: cat
  }, cat))))))))), /*#__PURE__*/React.createElement("div", {
    className: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`
  }, /*#__PURE__*/React.createElement(Card, {
    className: "border-l-4 border-l-blue-500"
  }, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-1"
  }, "Total Items"), /*#__PURE__*/React.createElement("p", {
    className: "text-3xl font-bold text-slate-900"
  }, totalItems)), /*#__PURE__*/React.createElement(Package, {
    className: "w-8 h-8 text-blue-500"
  })))), /*#__PURE__*/React.createElement(Card, {
    className: "border-l-4 border-l-green-500"
  }, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-1"
  }, "Total Units"), /*#__PURE__*/React.createElement("p", {
    className: "text-3xl font-bold text-slate-900"
  }, totalQuantity)), /*#__PURE__*/React.createElement(TrendingUp, {
    className: "w-8 h-8 text-green-500"
  })))), /*#__PURE__*/React.createElement(Card, {
    className: "border-l-4 border-l-yellow-500"
  }, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-1"
  }, "Low Stock"), /*#__PURE__*/React.createElement("p", {
    className: "text-3xl font-bold text-slate-900"
  }, lowStockItems)), /*#__PURE__*/React.createElement(AlertTriangle, {
    className: "w-8 h-8 text-yellow-500"
  })))), /*#__PURE__*/React.createElement(Card, {
    className: "border-l-4 border-l-red-500"
  }, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-1"
  }, "Out of Stock"), /*#__PURE__*/React.createElement("p", {
    className: "text-3xl font-bold text-slate-900"
  }, outOfStockItems)), /*#__PURE__*/React.createElement(AlertTriangle, {
    className: "w-8 h-8 text-red-500"
  }))))), reportType === 'summary' && /*#__PURE__*/React.createElement(Card, {
    className: `transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "Inventory Summary"), /*#__PURE__*/React.createElement(CardDescription, null, "Overview of current inventory status")), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement("div", {
    className: "space-y-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-3 gap-4"
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
  }, outOfStockItems))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    className: "font-semibold mb-3"
  }, "Category Breakdown"), /*#__PURE__*/React.createElement(Table, null, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, null, "Category"), /*#__PURE__*/React.createElement(TableHead, null, "Items"), /*#__PURE__*/React.createElement(TableHead, null, "Total Units"), /*#__PURE__*/React.createElement(TableHead, null, "Low Stock"))), /*#__PURE__*/React.createElement(TableBody, null, getCategorySummary().map(cat => /*#__PURE__*/React.createElement(TableRow, {
    key: cat.category
  }, /*#__PURE__*/React.createElement(TableCell, {
    className: "font-medium"
  }, cat.category), /*#__PURE__*/React.createElement(TableCell, null, cat.itemCount), /*#__PURE__*/React.createElement(TableCell, null, cat.totalQty), /*#__PURE__*/React.createElement(TableCell, null, cat.lowStock > 0 ? /*#__PURE__*/React.createElement(Badge, {
    variant: "destructive"
  }, cat.lowStock) : /*#__PURE__*/React.createElement(Badge, {
    variant: "outline"
  }, "0")))))))))), reportType === 'detailed' && /*#__PURE__*/React.createElement(Card, {
    className: `transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "Detailed Inventory"), /*#__PURE__*/React.createElement(CardDescription, null, selectedCategory === 'all' ? 'All items' : `${selectedCategory} category`, " - ", getFilteredInventory().length, " items")), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement(Table, null, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, null, "ID"), /*#__PURE__*/React.createElement(TableHead, null, "Item Name"), /*#__PURE__*/React.createElement(TableHead, null, "Category"), /*#__PURE__*/React.createElement(TableHead, null, "Quantity"), /*#__PURE__*/React.createElement(TableHead, null, "Status"), /*#__PURE__*/React.createElement(TableHead, null, "Last Updated"))), /*#__PURE__*/React.createElement(TableBody, null, getFilteredInventory().map(item => /*#__PURE__*/React.createElement(TableRow, {
    key: item.id
  }, /*#__PURE__*/React.createElement(TableCell, {
    className: "font-mono text-sm"
  }, item.id), /*#__PURE__*/React.createElement(TableCell, null, item.name), /*#__PURE__*/React.createElement(TableCell, null, item.category), /*#__PURE__*/React.createElement(TableCell, null, item.quantity), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Badge, {
    className: item.status === 'In Stock' ? 'bg-green-100 text-green-700' : item.status === 'Low Stock' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
  }, item.status)), /*#__PURE__*/React.createElement(TableCell, null, item.lastUpdated))))))), reportType === 'low-stock' && /*#__PURE__*/React.createElement(Card, {
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
  }, item.status)), /*#__PURE__*/React.createElement(TableCell, null, item.lastUpdated))))))), reportType === 'category' && /*#__PURE__*/React.createElement("div", {
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
    }, item.status)), /*#__PURE__*/React.createElement(TableCell, null, item.lastUpdated)))))));
  })));
}

