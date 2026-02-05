// Simple in-memory data store for demo inventory/users.
import { createContext, useContext, useState } from "react";

const DataContext = createContext(undefined);

// Demo inventory rows (UI uses these; not synced to server)
const initialInventory = [
  { id: "P001", name: "Premium Paint - White", category: "Paint", quantity: 150, reorderLevel: 20, status: "In Stock", lastUpdated: "2025-10-10" },
  { id: "P002", name: "Premium Paint - Blue", category: "Paint", quantity: 8, reorderLevel: 20, status: "Low Stock", lastUpdated: "2025-10-12" },
  { id: "T001", name: "Cement - Portland", category: "Construction", quantity: 320, reorderLevel: 20, status: "In Stock", lastUpdated: "2025-10-11" },
  { id: "T002", name: "Steel Rods 10mm", category: "Construction", quantity: 0, reorderLevel: 20, status: "Out of Stock", lastUpdated: "2025-10-09" },
  { id: "H001", name: "Hammer - Professional", category: "Tools", quantity: 45, reorderLevel: 20, status: "In Stock", lastUpdated: "2025-10-13" },
  { id: "H002", name: "Screwdriver Set", category: "Tools", quantity: 12, reorderLevel: 20, status: "Low Stock", lastUpdated: "2025-10-10" },
  { id: "E001", name: "Electrical Wire 2.0mm", category: "Electrical", quantity: 200, reorderLevel: 20, status: "In Stock", lastUpdated: "2025-10-12" },
  { id: "E002", name: "Light Bulbs LED", category: "Electrical", quantity: 5, reorderLevel: 20, status: "Low Stock", lastUpdated: "2025-10-11" },
];

// Pre-generated demo bcrypt hashes (see notes in original TS file)
// Demo users for UI prototyping (not used by server auth)
const initialUsers = [
  {
    id: "1",
    fullName: "Edna Cayetano",
    username: "admin",
    email: "edna@emcayetano.com",
    role: "Admin",
    branch: "Manggahan",
    status: "Active",
    createdDate: "2025-01-15",
    passwordSet: true,
    passwordHash: "$2a$10$rZ5F5F5F5F5F5F5F5F5F5OeKCvYZlH.3pW3v5F5F5F5F5F5F5F5F5",
  },
  {
    id: "2",
    fullName: "Alvin Guillermo",
    username: "employee",
    email: "alvin@emcayetano.com",
    role: "Employee",
    branch: "Manggahan",
    status: "Active",
    createdDate: "2025-02-20",
    passwordSet: true,
    passwordHash: "$2a$10$sZ5F5F5F5F5F5F5F5F5F5PeKCvYZlH.3pW3v5F5F5F5F5F5F5F5F6",
  },
  {
    id: "3",
    fullName: "Pedro Reyes",
    username: "preyes",
    email: "pedro@emcayetano.com",
    role: "Employee",
    branch: "San Rafael",
    status: "Active",
    createdDate: "2025-03-10",
    passwordSet: true,
    passwordHash: "$2a$10$tZ5F5F5F5F5F5F5F5F5F5QeKCvYZlH.3pW3v5F5F5F5F5F5F5F5F6",
  },
];

// Provides demo data via React context
export function DataProvider({ children }) {
  const [inventory, setInventory] = useState(initialInventory);
  const [archivedInventory, setArchivedInventory] = useState([]);
  const [users, setUsers] = useState(initialUsers);

  return (
    <DataContext.Provider value={{ inventory, setInventory, archivedInventory, setArchivedInventory, users, setUsers }}>
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
