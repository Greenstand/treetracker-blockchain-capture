import app from './app';
import { initDatabase } from './db/pool';
import { startFabricListener } from './services/fabricListener';

const PORT = process.env.PORT || 3000;

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM. Shutting down gracefully...');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const startServer = async (): Promise<void> => {
  try {
    await initDatabase();
    console.log('✅ Database initialized');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
  }

  try {
    await startFabricListener();
  } catch (error) {
    console.error('❌ Failed to start Fabric listener:', error);
  }

  app.listen(PORT, () => {
    console.log(`
🌳 Treetracker Capture Service
🚀 Server is running on port ${PORT}
🏥 Health check: http://localhost:${PORT}/health
📝 API docs: http://localhost:${PORT}/api/captures
🌐 Environment: ${process.env.NODE_ENV || 'development'}
    `);
  });
};

// Start the server
startServer();

export default app;
