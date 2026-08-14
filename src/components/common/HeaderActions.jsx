import { useState, useRef, useEffect } from 'react';

export default function HeaderActions({ 
  lowStockCount = 0, 
  pendingSyncCount = 0, 
  notifications = [], 
  tasks = [],
  onThemeToggle 
}) {
  const [activeMenu, setActiveMenu] = useState(null); // 'notifs' | 'tasks' | null
  const menuRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const notifBadge = notifications.length || lowStockCount;
  const taskBadge = tasks.length;

  return (
    <div ref={menuRef} style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
      
      {/* 1. Theme / Mode Toggle Icon */}
      <button 
        type="button" 
        onClick={onThemeToggle} 
        title="Toggle Theme"
        style={iconBtnStyle}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </button>

      {/* 2. Notifications Bell Icon */}
      <div style={{ position: 'relative' }}>
        <button 
          type="button" 
          onClick={() => setActiveMenu(activeMenu === 'notifs' ? null : 'notifs')} 
          title="Notifications"
          style={iconBtnStyle}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {notifBadge > 0 && <span style={{ ...badgeStyle, background: '#f59e0b' }}>{notifBadge}</span>}
        </button>

        {/* Notifications Dropdown */}
        {activeMenu === 'notifs' && (
          <div style={dropdownStyle}>
            <div style={dropdownHeaderStyle}>
              <strong>Notifications</strong> ({notifBadge})
            </div>
            <div style={dropdownBodyStyle}>
              {lowStockCount > 0 && (
                <div style={itemStyle}>
                  ⚠️ <strong>{lowStockCount} inventory items</strong> are low on stock.
                </div>
              )}
              {pendingSyncCount > 0 && (
                <div style={itemStyle}>
                  🔄 <strong>{pendingSyncCount} offline records</strong> waiting to sync.
                </div>
              )}
              {notifications.map((n, i) => (
                <div key={i} style={itemStyle}>• {n.message || n}</div>
              ))}
              {notifBadge === 0 && (
                <div style={{ ...itemStyle, color: 'var(--muted)', textAlign: 'center' }}>
                  No new notifications
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Pending Tasks / Notes Document Icon */}
      <div style={{ position: 'relative' }}>
        <button 
          type="button" 
          onClick={() => setActiveMenu(activeMenu === 'tasks' ? null : 'tasks')} 
          title="Pending Tasks"
          style={iconBtnStyle}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          {taskBadge > 0 && <span style={{ ...badgeStyle, background: '#8b5cf6' }}>{taskBadge}</span>}
        </button>

        {/* Tasks Dropdown */}
        {activeMenu === 'tasks' && (
          <div style={dropdownStyle}>
            <div style={dropdownHeaderStyle}>
              <strong>Pending Tasks</strong> ({taskBadge})
            </div>
            <div style={dropdownBodyStyle}>
              {tasks.length > 0 ? (
                tasks.map((t, i) => (
                  <div key={i} style={itemStyle}>📌 {t.title || t}</div>
                ))
              ) : (
                <div style={{ ...itemStyle, color: 'var(--muted)', textAlign: 'center' }}>
                  No pending tasks
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

// Inline Styles matching your dark theme
const iconBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text, #e2e8f0)',
  cursor: 'pointer',
  padding: 6,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative'
};

const badgeStyle = {
  position: 'absolute',
  top: -2,
  right: -4,
  color: '#fff',
  fontSize: 10,
  fontWeight: 'bold',
  borderRadius: '50%',
  width: 17,
  height: 17,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const dropdownStyle = {
  position: 'absolute',
  top: '120%',
  right: 0,
  width: 280,
  background: '#111827',
  border: '1px solid var(--line, #1f2937)',
  borderRadius: 10,
  boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
  zIndex: 100,
  overflow: 'hidden'
};

const dropdownHeaderStyle = {
  padding: '10px 14px',
  borderBottom: '1px solid var(--line, #1f2937)',
  fontSize: 13,
  background: '#1a2234'
};

const dropdownBodyStyle = {
  maxHeight: 220,
  overflowY: 'auto'
};

const itemStyle = {
  padding: '10px 14px',
  fontSize: 12,
  borderBottom: '1px solid var(--line-soft, #1f2937)',
  lineHeight: 1.4
};
