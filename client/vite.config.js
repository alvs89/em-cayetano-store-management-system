import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  resolve: {
    extensions: ['.js', '.jsx', '.json'],
    alias: {
      'sonner@2.0.3': 'sonner',
      'lucide-react@0.487.0': 'lucide-react',
      'class-variance-authority@0.7.1': 'class-variance-authority',
      '@radix-ui/react-tooltip@1.1.8': '@radix-ui/react-tooltip',
      '@radix-ui/react-tabs@1.1.3': '@radix-ui/react-tabs',
      '@radix-ui/react-slot@1.1.2': '@radix-ui/react-slot',
      '@radix-ui/react-separator@1.1.2': '@radix-ui/react-separator',
      '@radix-ui/react-select@2.1.6': '@radix-ui/react-select',
      '@radix-ui/react-label@2.1.2': '@radix-ui/react-label',
      '@radix-ui/react-dialog@1.1.6': '@radix-ui/react-dialog',
      '@radix-ui/react-avatar@1.1.3': '@radix-ui/react-avatar',
      '@radix-ui/react-alert-dialog@1.1.6': '@radix-ui/react-alert-dialog',
    },
  },
  build: {
    target: 'esnext',
    outDir: 'build',
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (!normalizedId.includes('node_modules')) {
            if (normalizedId.includes('/src/components/SalesModule')) return 'module-sales';
            if (normalizedId.includes('/src/components/InventoryModule')) return 'module-inventory';
            if (normalizedId.includes('/src/components/ReportsModule')) return 'module-reports';
            if (normalizedId.includes('/src/components/PurchasesModule')) return 'module-purchases';
            if (normalizedId.includes('/src/components/Dashboard')) return 'module-dashboard';
            if (
              normalizedId.includes('/src/components/MaintenanceModule') ||
              normalizedId.includes('/src/components/UserManagementModule') ||
              normalizedId.includes('/src/components/AuditTrailModule')
            ) {
              return 'module-admin';
            }
            if (
              normalizedId.includes('/src/components/ArchiveModule') ||
              normalizedId.includes('/src/components/SearchModule') ||
              normalizedId.includes('/src/components/AlertsModule') ||
              normalizedId.includes('/src/components/HelpModule')
            ) {
              return 'module-support';
            }
            return undefined;
          }
          if (id.includes('@radix-ui')) {
            return 'vendor-radix';
          }
          if (id.includes('react-dom') || id.includes('react-router-dom') || /node_modules[\\/]react[\\/]/.test(id)) {
            return 'vendor-react';
          }
          if (id.includes('lucide-react')) {
            return 'vendor-icons';
          }
          if (id.includes('jspdf-autotable')) {
            return 'vendor-pdf-table';
          }
          if (id.includes('jspdf')) {
            return 'vendor-jspdf';
          }
          if (id.includes('html2canvas')) {
            return 'vendor-html2canvas';
          }
          if (id.includes('dompurify')) {
            return 'vendor-dompurify';
          }
          if (id.includes('axios') || id.includes('sonner')) {
            return 'vendor-app';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
