import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";

const DataContext = createContext(undefined);

// Inventory API helpers
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const formatUnitQuantity = quantity => `${quantity} ${Number(quantity) === 1 ? "unit" : "units"}`;

const getStockAlertEventId = (prefix, item) => {
  const quantity = Number(item.quantity);
  const quantityKey = Number.isFinite(quantity) ? quantity : "unknown";
  const timestampKey = item.lastUpdated || "no-timestamp";

  return `${prefix}-${item.id}-${quantityKey}-${timestampKey}`;
};

const generateInventoryAlerts = inventory => {
  const alerts = [];
  inventory.forEach(item => {
    const timestampRaw = item.lastUpdated || new Date().toISOString();

    if (item.status === 'Out of Stock') {
      alerts.push({
        id: getStockAlertEventId('out', item),
        type: 'warning',
        title: 'Out of Stock',
        message: `${item.name} is completely out of stock`,
        timestampRaw,
        read: false,
        actionable: true,
        relatedModule: 'inventory'
      });
    } else if (item.status === 'Low Stock') {
      alerts.push({
        id: getStockAlertEventId('low', item),
        type: 'warning',
        title: 'Low Stock Alert',
        message: `${item.name} is running low (${formatUnitQuantity(item.quantity)} remaining)`,
        timestampRaw,
        read: false,
        actionable: true,
        relatedModule: 'inventory'
      });
    }
  });
  return alerts;
};

const generateSystemAlerts = (summary, role) => {
  const alerts = [];

  if (role === "Admin") {
    if (summary.lastBackupAt) {
      const backupTime = new Date(summary.lastBackupAt).getTime();
      const ageDays = Math.floor((Date.now() - backupTime) / (1000 * 60 * 60 * 24));

      if (ageDays >= 3) {
        alerts.push({
          id: 'backup-reminder',
          type: 'info',
          title: 'System Backup Reminder',
          message: 'The most recent backup was completed.',
          timestampRaw: summary.lastBackupAt || new Date().toISOString(),
          read: false,
          actionable: true,
          relatedModule: 'maintenance'
        });
      }
    } else {
      alerts.push({
        id: 'backup-missing',
        type: 'warning',
        title: 'No Backup Recorded',
        message: 'No system backup has been recorded yet.',
        timestampRaw: new Date().toISOString(),
        read: false,
        actionable: true,
        relatedModule: 'maintenance'
      });
    }

    (summary.pendingRegistrations || []).forEach(user => {
      const branchLabel = user.branch ? ` for ${user.branch}` : "";
      alerts.push({
        id: `pending-user-${user.user_id}`,
        type: 'info',
        title: 'New User Registration',
        message: `${user.full_name || user.username || 'A user'} has registered${branchLabel} and is pending admin approval.`,
        timestampRaw: user.created_at || new Date().toISOString(),
        read: false,
        actionable: true,
        relatedModule: 'user-management'
      });
    });
  }

  return alerts;
};

export function DataProvider({ children }) {
  const [inventory, setInventory] = useState([]);
  const [archivedInventory, setArchivedInventory] = useState([]);
  const [stockMovements, setStockMovements] = useState([]);
  const [users, setUsers] = useState([]); // User logic remains as before
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [inventoryError, setInventoryError] = useState(null);
  const [systemSummary, setSystemSummary] = useState({
    pendingRegistrations: [],
    lastBackupAt: null
  });
  const [dismissedAlertIds, setDismissedAlertIds] = useState(() => {
    try {
      const stored = localStorage.getItem("dismissed_alert_ids");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [readAlertIds, setReadAlertIds] = useState(() => {
    try {
      const stored = localStorage.getItem("read_alert_ids");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [activeUserRole, setActiveUserRole] = useState(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored).role : null;
    } catch {
      return null;
    }
  });

  // Fetch inventory from backend
  const fetchInventory = useCallback(async () => {
    setLoadingInventory(true);
    setInventoryError(null);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setInventory([]);
        return;
      }
      const res = await axios.get(`${API_BASE}/api/inventory`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      // Map backend fields to frontend shape
      const items = (res.data.products || []).map((p) => ({
        id: p.inventory_id?.toString() ?? '',
        productId: p.product_id?.toString() ?? '',
        name: p.name,
        category: p.category,
        quantity: p.stock_level,
        reorderLevel: p.min_stock_level,
        status: p.status,
        branch: p.branch,
        // preserve full ISO timestamp so the UI can display accurate relative times
        lastUpdated: p.last_updated ? new Date(p.last_updated).toISOString() : '',
      }));
      setInventory(items);
    } catch (err) {
      setInventoryError(err?.response?.data?.error || err.message || "Failed to load inventory");
      setInventory([]);
    } finally {
      setLoadingInventory(false);
    }
  }, []);

  const fetchArchivedInventory = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setArchivedInventory([]);
        return;
      }
      const res = await axios.get(`${API_BASE}/api/archive`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const items = (res.data.archivedProducts || []).map((p) => ({
        id: p.archived_inventory_id?.toString() ?? '',
        originalInventoryId: p.original_inventory_id?.toString() ?? '',
        productId: p.product_id?.toString() ?? '',
        name: p.name,
        category: p.category,
        quantity: p.stock_level,
        reorderLevel: p.min_stock_level,
        status: p.status,
        branch: p.branch,
        // preserve full ISO timestamps for accuracy in alerts and history
        lastUpdated: p.last_updated ? new Date(p.last_updated).toISOString() : '',
        archivedAt: p.archived_at ? new Date(p.archived_at).toISOString() : '',
      }));
      setArchivedInventory(items);
    } catch (err) {
      setArchivedInventory([]);
    }
  }, []);

  const fetchStockMovements = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setStockMovements([]);
        return;
      }
      const res = await axios.get(`${API_BASE}/api/stock-movements`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const movements = (res.data.movements || []).map((movement) => ({
        id: movement.movement_id?.toString() ?? '',
        inventoryId: movement.inventory_id?.toString() ?? '',
        productId: movement.product_id?.toString() ?? '',
        itemName: movement.item_name,
        category: movement.category,
        branch: movement.branch,
        action: movement.action,
        quantityChanged: Number(movement.quantity_changed || 0),
        previousQuantity: Number(movement.previous_quantity || 0),
        newQuantity: Number(movement.new_quantity || 0),
        note: movement.note || '',
        actorId: movement.actor_id?.toString() ?? '',
        actorName: movement.actor_name || '',
        createdAt: movement.created_at ? new Date(movement.created_at).toISOString() : '',
      }));
      setStockMovements(movements);
    } catch (err) {
      console.error('Failed to load stock movements:', err);
      setStockMovements([]);
    }
  }, []);

  const refreshSystemSummary = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setSystemSummary({ pendingRegistrations: [], lastBackupAt: null });
        return;
      }
      const response = await axios.get(`${API_BASE}/api/system/summary`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setSystemSummary(response.data || {});
    } catch (err) {
      console.error('Failed to load system summary:', err);
    }
  }, []);

  useEffect(() => {
    fetchInventory();
    fetchArchivedInventory();
    fetchStockMovements();
    refreshSystemSummary();
  }, [fetchInventory, fetchArchivedInventory, fetchStockMovements, refreshSystemSummary]);

  useEffect(() => {
    const handleAuthStateChanged = () => {
      try {
        const stored = localStorage.getItem("user");
        setActiveUserRole(stored ? JSON.parse(stored).role : null);
      } catch {
        setActiveUserRole(null);
      }
      fetchInventory();
      fetchArchivedInventory();
      fetchStockMovements();
      refreshSystemSummary();
    };

    window.addEventListener('auth-state-changed', handleAuthStateChanged);
    return () => {
      window.removeEventListener('auth-state-changed', handleAuthStateChanged);
    };
  }, [fetchInventory, fetchArchivedInventory, fetchStockMovements, refreshSystemSummary]);

  useEffect(() => {
    const id = setInterval(fetchInventory, 30000);

    return () => clearInterval(id);
  }, [fetchInventory]);

  useEffect(() => {
    const id = setInterval(fetchStockMovements, 30000);

    return () => clearInterval(id);
  }, [fetchStockMovements]);

  useEffect(() => {
    const intervalMs = activeUserRole === "Admin" ? 10000 : 30000;
    const id = setInterval(refreshSystemSummary, intervalMs);

    return () => clearInterval(id);
  }, [activeUserRole, refreshSystemSummary]);

  useEffect(() => {
    if (activeUserRole !== "Admin") return undefined;

    const refreshAdminAlerts = () => {
      refreshSystemSummary();
    };
    const handleStorage = event => {
      if (event.key === "registration-submitted-at") {
        refreshAdminAlerts();
      }
    };

    window.addEventListener("registration-submitted", refreshAdminAlerts);
    window.addEventListener("focus", refreshAdminAlerts);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("registration-submitted", refreshAdminAlerts);
      window.removeEventListener("focus", refreshAdminAlerts);
      window.removeEventListener("storage", handleStorage);
    };
  }, [activeUserRole, refreshSystemSummary]);

  useEffect(() => {
    try {
      localStorage.setItem("dismissed_alert_ids", JSON.stringify(dismissedAlertIds));
    } catch {
      // Ignore storage write failures.
    }
  }, [dismissedAlertIds]);

  useEffect(() => {
    try {
      localStorage.setItem("read_alert_ids", JSON.stringify(readAlertIds));
    } catch {
      // Ignore storage write failures.
    }
  }, [readAlertIds]);

  useEffect(() => {
    if (activeUserRole !== "Admin") return;

    const activePendingAlertIds = new Set(
      (systemSummary.pendingRegistrations || []).map(user => `pending-user-${user.user_id}`)
    );
    if (activePendingAlertIds.size === 0) return;

    setDismissedAlertIds(prev => prev.filter(alertId => !activePendingAlertIds.has(alertId)));
  }, [activeUserRole, systemSummary.pendingRegistrations]);

  const alerts = useMemo(() => {
    const inventoryAlerts = generateInventoryAlerts(inventory);
    const systemAlerts = generateSystemAlerts(systemSummary, activeUserRole);
    return [...inventoryAlerts, ...systemAlerts]
      .filter(alert => !dismissedAlertIds.includes(alert.id))
      .map(alert => ({
        ...alert,
        read: readAlertIds.includes(alert.id)
      }));
  }, [activeUserRole, dismissedAlertIds, inventory, readAlertIds, systemSummary]);

  const unreadAlertCount = alerts.filter(alert => !alert.read).length;
  const warningAlertCount = alerts.filter(alert => alert.type === "warning").length;
  const infoAlertCount = alerts.filter(alert => alert.type === "info").length;
  const successAlertCount = alerts.filter(alert => alert.type === "success").length;

  const auditAction = useCallback(async (action, target = {}) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      await axios.post(
        `${API_BASE}/api/audit-logs`,
        {
          action,
          target_id: target.targetId,
          target_name: target.targetName,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error("Failed to record audit log:", err);
    }
  }, []);

  const markAlertRead = (id) => {
    if (readAlertIds.includes(id)) return;

    const alert = alerts.find(item => item.id === id);
    setReadAlertIds(prev => (prev.includes(id) ? prev : [...prev, id]));
    auditAction("MARK_ALERT_READ", {
      targetName: alert ? `${alert.title}: ${alert.message}` : `Alert ${id}`,
    });
  };

  const unmarkAlertRead = (id) => {
    setReadAlertIds(prev => prev.filter(alertId => alertId !== id));
  };

  const dismissAlert = (id) => {
    const alert = alerts.find(item => item.id === id);
    setDismissedAlertIds(prev => (prev.includes(id) ? prev : [...prev, id]));
    auditAction("DISMISS_ALERT", {
      targetName: alert ? `${alert.title}: ${alert.message}` : `Alert ${id}`,
    });
  };

  const markAllAlertsRead = () => {
    setReadAlertIds(alerts.map(alert => alert.id));
    auditAction("MARK_ALL_ALERTS_READ", {
      targetName: `${alerts.length} alert${alerts.length === 1 ? "" : "s"}`,
    });
  };

  const unmarkAllAlertsRead = () => {
    setReadAlertIds(prev => prev.filter(alertId => !alerts.some(alert => alert.id === alertId)));
  };

  // Add new inventory item
  const addInventoryItem = async (item) => {
    const token = localStorage.getItem("token");
    const res = await axios.post(
      `${API_BASE}/api/inventory`,
      {
        name: item.name,
        category: item.category,
        stock_level: item.quantity,
        min_stock_level: item.reorderLevel,
      },
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    await fetchInventory();
    await fetchArchivedInventory();
    await fetchStockMovements();
    return res.data.product;
  };

  // Update inventory item (stock in/out, edit)
  const updateInventoryItem = async (id, updates) => {
    const token = localStorage.getItem("token");
    // Optimistic UI update: set the updated quantity and timestamp immediately
    setInventory((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              name: updates.name ?? it.name,
              category: updates.category ?? it.category,
              quantity: typeof updates.quantity === 'number' ? updates.quantity : it.quantity,
              reorderLevel: updates.reorderLevel ?? it.reorderLevel,
              lastUpdated: new Date().toISOString(),
            }
          : it
      )
    );

    try {
      const res = await axios.put(
        `${API_BASE}/api/inventory/${id}`,
        {
          name: updates.name,
          category: updates.category,
          stock_level: updates.quantity,
          min_stock_level: updates.reorderLevel,
          movement_action: updates.movementAction,
          movement_quantity: updates.movementQuantity,
          movement_note: updates.movementNote,
        },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );

      // Re-sync with server to ensure canonical state
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      return res.data.product;
    } catch (err) {
      // On error, reload from server to revert optimistic change
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      throw err;
    }
  };

  // Archive (delete) inventory item
  const archiveInventoryItem = async (id) => {
    const token = localStorage.getItem("token");
    const itemToArchive = inventory.find(item => item.id === id);

    if (itemToArchive) {
      const archivedAt = new Date().toISOString();
      setInventory(prev => prev.filter(item => item.id !== id));
      setArchivedInventory(prev => [
        {
          ...itemToArchive,
          originalInventoryId: itemToArchive.originalInventoryId || itemToArchive.id,
          archivedAt,
        },
        ...prev,
      ]);
    }

    try {
      await axios.delete(`${API_BASE}/api/inventory/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
    } catch (err) {
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      throw err;
    }
  };

  const restoreArchivedInventoryItem = async (id) => {
    const token = localStorage.getItem("token");
    const itemToRestore = archivedInventory.find(item => item.id === id);

    if (itemToRestore) {
      const { archivedAt, originalInventoryId, ...restoredItem } = itemToRestore;
      setArchivedInventory(prev => prev.filter(item => item.id !== id));
      setInventory(prev => [
        {
          ...restoredItem,
          id: originalInventoryId || itemToRestore.id,
          lastUpdated: new Date().toISOString(),
        },
        ...prev,
      ]);
    }

    try {
      const res = await axios.post(
        `${API_BASE}/api/archive/${id}/restore`,
        {},
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      return res.data.product;
    } catch (err) {
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      throw err;
    }
  };

  return (
    <DataContext.Provider
      value={{
        inventory,
        setInventory,
        archivedInventory,
        setArchivedInventory,
        stockMovements,
        fetchStockMovements,
        users,
        setUsers,
        loadingInventory,
        inventoryError,
        fetchInventory,
        fetchArchivedInventory,
        addInventoryItem,
        updateInventoryItem,
        archiveInventoryItem,
        restoreArchivedInventoryItem,
        alerts,
        unreadAlertCount,
        warningAlertCount,
        infoAlertCount,
        successAlertCount,
        markAlertRead,
        dismissAlert,
        markAllAlertsRead,
        unmarkAllAlertsRead,
        unmarkAlertRead,
        auditAction,
        refreshSystemSummary,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
}
