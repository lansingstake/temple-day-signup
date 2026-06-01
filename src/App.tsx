import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar, 
  CheckCircle, 
  AlertTriangle, 
  Info, 
  Settings, 
  RefreshCw, 
  Sun,
  Moon
} from 'lucide-react';

interface SlotData {
  time: string;
  colIndex: number;
  mainCapacity: number;
  mainSignedUp: string[];
  waitCapacity: number;
  waitSignedUp: string[];
  helpersCapacity: number;
  helpersSignedUp: string[];
  mainStartRow: number;
  mainEndRow: number;
  waitStartRow: number | null;
  waitEndRow: number | null;
  helpersStartRow: number | null;
  helpersEndRow: number | null;
  customNotice?: string;
}

interface TabData {
  sheetName: string;
  slots: SlotData[];
}

interface SheetResponse {
  [tabName: string]: TabData;
}

interface ActiveSignupState {
  tab: string;
  slot: string;
  type: 'main' | 'wait' | 'helpers';
}

interface ToastMessage {
  id: string;
  type: 'success' | 'error';
  text: string;
}

export default function App() {
  const [appsScriptUrl, setAppsScriptUrl] = useState<string>('');
  const [isUrlConfigured, setIsUrlConfigured] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string>('');
  const [sheetData, setSheetData] = useState<SheetResponse | null>(null);
  const [eventDate, setEventDate] = useState<string>('Tuesday, June 30th 2026');
  const [loading, setLoading] = useState<boolean>(false);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [activeSection, setActiveSection] = useState<string>('');

  // Active form state
  const [activeSignup, setActiveSignup] = useState<ActiveSignupState | null>(null);
  const [numSlots, setNumSlots] = useState<number>(1);
  const [names, setNames] = useState<string[]>(['']);
  const [helperTypes, setHelperTypes] = useState<string[]>(['Elder / High Priest']);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Input ref to hold URL during setup
  const urlInputRef = useRef<HTMLInputElement>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('app_theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  // Load configured Web App URL from env
  useEffect(() => {
    const envUrl = import.meta.env.VITE_APPS_SCRIPT_URL;
    if (envUrl) {
      setAppsScriptUrl(envUrl);
      setIsUrlConfigured(true);
    }
  }, []);

  // Poll for data updates every 30 seconds if configured
  useEffect(() => {
    if (!isUrlConfigured || !appsScriptUrl) return;

    fetchData(true);

    const interval = setInterval(() => {
      fetchData(false);
    }, 30000);

    return () => clearInterval(interval);
  }, [isUrlConfigured, appsScriptUrl]);

  // Sync validation errors when inputs change
  useEffect(() => {
    validateInputs();
  }, [names, numSlots, activeSignup]);

  const addToast = (type: 'success' | 'error', text: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const fetchData = async (showMainLoading: boolean) => {
    if (showMainLoading) setLoading(true);
    else setIsPolling(true);

    try {
      const res = await fetch(appsScriptUrl);
      if (!res.ok) throw new Error('Network request failed. Make sure your Apps Script Web App URL is correct.');
      const data = await res.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      let sheets: SheetResponse = {};
      let dateVal = 'Tuesday, June 30th 2026';

      if (data.sheets) {
        sheets = data.sheets;
        if (data.generalInfo && data.generalInfo.date) {
          dateVal = data.generalInfo.date;
        }
      } else {
        // Fallback for older Apps Script responses
        sheets = data;
      }
      
      setSheetData(sheets);
      setEventDate(dateVal);
      setConnectionError('');
      
      // Set active section to first sheet name if not set
      const sheetNames = Object.keys(sheets);
      if (sheetNames.length > 0 && !activeSection) {
        setActiveSection(sheetNames[0]);
      }
    } catch (err: any) {
      console.error(err);
      const errMsg = err.message || '';
      const isCorsOrNetwork = errMsg.toLowerCase().includes('failed to fetch') || errMsg.toLowerCase().includes('network');
      const formattedErr = isCorsOrNetwork 
        ? 'Could not connect to Google Apps Script. Please verify that:\n1. The Web App is deployed (Deploy > New deployment).\n2. "Execute as" is set to "Me".\n3. "Who has access" is set to "Anyone".'
        : `Error loading sheet data: ${errMsg}`;
      
      setConnectionError(formattedErr);
      addToast('error', `Error loading sheet data: ${err.message}`);
      if (showMainLoading) {
        setIsUrlConfigured(false);
      }
    } finally {
      setLoading(false);
      setIsPolling(false);
    }
  };


  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const url = urlInputRef.current?.value.trim() || '';
    if (!url) {
      addToast('error', 'Please enter a valid URL');
      return;
    }
    localStorage.setItem('apps_script_url', url);
    setAppsScriptUrl(url);
    setIsUrlConfigured(true);
  };

  const handleStartSignup = (tab: string, slot: string, type: 'main' | 'wait' | 'helpers') => {
    setActiveSignup({ tab, slot, type });
    setNumSlots(1);
    setNames(['']);
    setHelperTypes(['Elder / High Priest']);
    setValidationErrors([]);
  };

  const handleCancelSignup = () => {
    setActiveSignup(null);
    setNumSlots(1);
    setNames(['']);
    setHelperTypes(['Elder / High Priest']);
    setValidationErrors([]);
  };

  const handleNumSlotsChange = (val: number) => {
    setNumSlots(val);
    
    // For resizing fields, fallback to 1 if empty/NaN
    const clamped = Math.max(1, isNaN(val) || val === 0 ? 1 : val);
    
    // Resize names array
    setNames(prev => {
      const next = [...prev];
      if (clamped > next.length) {
        while (next.length < clamped) next.push('');
      } else {
        next.splice(clamped);
      }
      return next;
    });

    // Resize helper types array
    setHelperTypes(prev => {
      const next = [...prev];
      if (clamped > next.length) {
        while (next.length < clamped) next.push('Elder / High Priest');
      } else {
        next.splice(clamped);
      }
      return next;
    });
  };

  const handleNameChange = (index: number, val: string) => {
    setNames(prev => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleHelperTypeChange = (index: number, val: string) => {
    setHelperTypes(prev => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const validateInputs = () => {
    if (!activeSignup) return;
    const errors: string[] = [];

    names.forEach((name, i) => {
      const trimmed = name.trim();
      if (!trimmed) {
        errors[i] = 'Name is required';
        return;
      }
      const words = trimmed.split(/\s+/).filter(Boolean);
      if (words.length < 2) {
        errors[i] = 'Please enter at least a first and last name';
      }
    });

    setValidationErrors(errors);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSignup || !sheetData) return;

    // Validate name fields
    const errors: string[] = [];
    names.forEach((name, i) => {
      const trimmed = name.trim();
      if (!trimmed) {
        errors[i] = 'Name is required';
        return;
      }
      const words = trimmed.split(/\s+/).filter(Boolean);
      if (words.length < 2) {
        errors[i] = 'Please enter at least a first and last name';
      }
    });

    if (errors.some(Boolean)) {
      setValidationErrors(errors);
      addToast('error', 'Please correct the validation errors in the form.');
      return;
    }

    // Double check availability
    const tabObj = sheetData[activeSignup.tab];
    const slotObj = tabObj?.slots.find(s => s.time === activeSignup.slot);
    if (!slotObj) return;

    let available = 0;
    if (activeSignup.type === 'main') {
      available = slotObj.mainCapacity - slotObj.mainSignedUp.length;
    } else if (activeSignup.type === 'wait') {
      available = slotObj.waitCapacity - slotObj.waitSignedUp.length;
    } else if (activeSignup.type === 'helpers') {
      available = slotObj.helpersCapacity - slotObj.helpersSignedUp.length;
    }

    if (numSlots > available) {
      const msg = available === 0 
        ? "Cannot complete signup. All slots have been taken for this session time."
        : `Cannot complete signup. Only ${available} slot(s) left.`;
      addToast('error', msg);
      return;
    }

    setIsSubmitting(true);

    // Format names (append helper types for priesthood helpers)
    const formattedEntries = names.map((name, idx) => {
      const cleanName = name.trim();
      if (activeSignup.type === 'helpers') {
        return `${cleanName} (${helperTypes[idx]})`;
      }
      return cleanName;
    });

    try {
      const payload = {
        tab: activeSignup.tab,
        slot: activeSignup.slot,
        type: activeSignup.type,
        entries: formattedEntries
      };

      const res = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8', // Bypass CORS preflight for Apps Script
        },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (result.status === 'success') {
        addToast('success', `Successfully signed up ${numSlots} person(s)!`);
        setActiveSignup(null);
        // Refresh immediately
        fetchData(false);
      } else {
        throw new Error(result.message || 'Failed to submit signup');
      }
    } catch (err: any) {
      console.error(err);
      addToast('error', `Signup failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to scroll to a section
  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (!isUrlConfigured) {
    return (
      <div className="config-screen">
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Settings size={48} className="spinner" style={{ animation: 'none', color: 'var(--primary)' }} />
        </div>
        <h2>Configure Sheets API Connection</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          Please enter your deployed Google Apps Script Web App URL below. This script connects the app directly to your Google Sheet.
        </p>
        <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input 
            type="url"
            ref={urlInputRef}
            placeholder="https://script.google.com/macros/s/.../exec"
            className="input-text"
            required
            defaultValue={import.meta.env.VITE_APPS_SCRIPT_URL || ''}
          />
          {connectionError && (
            <div className="warning-label" style={{ marginTop: '0.5rem', marginBottom: '0.5rem', whiteSpace: 'pre-line', textAlign: 'left' }}>
              <AlertTriangle size={18} style={{ marginRight: '0.5rem' }} />
              <span>{connectionError}</span>
            </div>
          )}
          <button type="submit" className="signup-trigger-btn">
            Connect Spreadsheet
          </button>
        </form>
      </div>
    );
  }

  if (loading && !sheetData) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <div className="loading-text">Synchronizing with Temple Sheet...</div>
      </div>
    );
  }

  return (
    <>
      {/* Toast Notification HUD */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      {isPolling && (
        <div style={{
          position: 'fixed',
          top: '1.5rem',
          right: '1.5rem',
          zIndex: 1000,
          fontSize: '0.85rem',
          color: 'var(--primary)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          background: 'rgba(30, 41, 59, 0.7)',
          border: '1px solid var(--primary)',
          padding: '0.5rem 0.9rem',
          borderRadius: '100px',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
          fontWeight: 600,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <RefreshCw size={14} className="spinner" /> Syncing live...
        </div>
      )}

      <header className="app-header">
        <h1 className="app-title">Temple Day Signup</h1>
        <div style={{ fontSize: '1.25rem', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '-0.25rem', marginBottom: '0.5rem' }}>
          {eventDate}
        </div>
        <div style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--accent)', marginTop: '0rem', marginBottom: '0.75rem', fontFamily: "'Outfit', sans-serif" }}>
          Lansing Michigan Stake
        </div>
        <p className="app-subtitle">
          Sign up for Temple Day events below.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem' }}>
           <button 
            onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
            style={{ 
              background: 'rgba(255,255,255,0.06)', 
              border: '1px solid rgba(255,255,255,0.1)', 
              color: 'var(--text-secondary)', 
              fontSize: '0.8rem', 
              cursor: 'pointer',
              padding: '0.35rem 0.75rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            {theme === 'light' ? <Moon size={12} /> : <Sun size={12} />}
            <span>Mode: {theme === 'light' ? 'Dark' : 'Light'}</span>
          </button>
        </div>
      </header>

      {/* Navigation Jump Menu */}
      <nav className="sections-nav">
        {sheetData && Object.keys(sheetData).map(sheetName => (
          <button
            key={sheetName}
            onClick={() => scrollToSection(sheetName)}
            className={`nav-item ${activeSection === sheetName ? 'active' : ''}`}
          >
            {sheetName}
          </button>
        ))}
      </nav>

      {/* Help / Support Notice Banner */}
      <div className="support-notice-banner">
        <Info size={24} style={{ flexShrink: 0 }} />
        <span>
          If you have trouble signing up, or need to remove your name from any session, please EMAIL <a href="mailto:LansingStake@gmail.com">LansingStake@gmail.com</a>.
        </span>
      </div>

      {/* Main Form Sheets Container */}
      <main>
        {sheetData && Object.values(sheetData).map(section => {
          const isBaptistry = section.sheetName === 'Baptistry';
          return (
            <div 
              key={section.sheetName} 
              id={section.sheetName} 
              className="section-container"
            >
              <div className="section-header">
                <h2 className="section-title">
                  <Calendar size={24} />
                  {section.sheetName}
                </h2>
                <span className="badge badge-available">
                  {section.slots.length} Session Times Available
                </span>
              </div>

              {section.sheetName === "Primary Drop Off" && (
                <div style={{
                  background: '#1f2937',
                  color: '#fbbf24',
                  border: '1px solid #d97706',
                  borderRadius: '12px',
                  padding: '1rem 1.5rem',
                  marginBottom: '1.5rem',
                  fontWeight: '700',
                  fontSize: '0.95rem',
                  textAlign: 'center',
                  letterSpacing: '0.05em'
                }}>
                  CHILDREN will need to Bring A <u style={{ textDecoration: 'underline' }}>Sack Lunch</u> - LABELED with their Name!
                </div>
              )}

              {section.sheetName === "Baptistry" && (
                <div style={{
                  background: '#1f2937',
                  color: '#fbbf24',
                  border: '1px solid #d97706',
                  borderRadius: '12px',
                  padding: '1rem 1.5rem',
                  marginBottom: '1.5rem',
                  fontWeight: '700',
                  fontSize: '0.95rem',
                  textAlign: 'center',
                  letterSpacing: '0.05em'
                }}>
                  If you have a large group from the same unit, please have your unit leader contact President Earl.
                </div>
              )}

              {/* Grid of Slots in this Tab */}
              <div className="slots-grid">
                {section.slots.map((slot, sIdx) => {
                  const mainFilled = slot.mainSignedUp.length;
                  const mainLeft = slot.mainCapacity - mainFilled;
                  
                  const hasWaitlist = slot.waitStartRow !== null;
                  const waitFilled = slot.waitSignedUp.length;
                  const waitLeft = slot.waitCapacity - waitFilled;

                  const hasHelpers = slot.helpersStartRow !== null;
                  const helpersFilled = slot.helpersSignedUp.length;
                  const helpersLeft = slot.helpersCapacity - helpersFilled;

                  // Column notices from sheet data (fallback to default if customNotice is empty/missing)
                  let customNotice = slot.customNotice || '';
                  if (!customNotice && isBaptistry) {
                    if (sIdx === 0) {
                      customNotice = 'Adult / YSA Only (18+)';
                    } else {
                      customNotice = 'YOUTH SESSION ONLY';
                    }
                  }

                  return (
                    <div key={slot.time} className="slot-card">
                      <div className="slot-header">
                        <span className="slot-time">{slot.time}</span>
                        {mainLeft > 0 ? (
                          <span className="badge badge-available">
                            {mainLeft} / {slot.mainCapacity} Left
                          </span>
                        ) : (
                          <span className="badge badge-full">
                            Full
                          </span>
                        )}
                      </div>

                      {customNotice && (
                        <div className="notice-banner" style={{ 
                          margin: '0.5rem 0 0.75rem 0', 
                          fontSize: '0.95rem', 
                          fontWeight: '700', 
                          padding: '0.65rem 0.9rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}>
                          <Info size={16} style={{ flexShrink: 0 }} />
                          <span>{customNotice}</span>
                        </div>
                      )}

                      {/* Main Sign-Up Block */}
                      <div className="sub-sections-container">
                        <div className="sub-section-block" style={{ border: 'none', paddingTop: 0 }}>
                          <span className="signed-up-title">Signups ({mainFilled} / {slot.mainCapacity})</span>
                          <div className="signed-up-list">
                            {slot.mainSignedUp.length > 0 ? (
                              slot.mainSignedUp.map((name, i) => (
                                <div key={i} className="signed-up-item">{name}</div>
                              ))
                            ) : (
                              <div className="signed-up-empty">No signups yet</div>
                            )}
                          </div>

                          {/* Trigger Sign Up Button for Main Slots */}
                          {activeSignup?.tab === section.sheetName && 
                           activeSignup?.slot === slot.time && 
                           activeSignup?.type === 'main' ? (
                            
                            // Expanded Sign Up Form
                            <form onSubmit={handleSubmit} className="signup-form-expand">
                              <div className="form-group">
                                <label className="form-label">Number of People:</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <button 
                                    type="button" 
                                    onClick={() => handleNumSlotsChange(Math.max(1, (numSlots || 1) - 1))}
                                    style={{ padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '1.1rem', cursor: 'pointer', userSelect: 'none' }}
                                  >
                                    -
                                  </button>
                                  <input 
                                    type="number" 
                                    min={1} 
                                    max={mainLeft}
                                    value={isNaN(numSlots) || numSlots === 0 ? '' : numSlots} 
                                    onChange={(e) => handleNumSlotsChange(parseInt(e.target.value))}
                                    onBlur={() => {
                                      if (isNaN(numSlots) || numSlots < 1) {
                                        handleNumSlotsChange(1);
                                      }
                                    }}
                                    className="input-number"
                                    style={{ textAlign: 'center', maxWidth: '80px' }}
                                  />
                                  <button 
                                    type="button" 
                                    onClick={() => handleNumSlotsChange(Math.min(mainLeft, (numSlots || 1) + 1))}
                                    style={{ padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '1.1rem', cursor: 'pointer', userSelect: 'none' }}
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              {numSlots > mainLeft && (
                                <div className="warning-label">
                                  <AlertTriangle size={14} />
                                  <span>
                                    {mainLeft === 0 
                                      ? "All slots have been taken for this session time." 
                                      : `Only ${mainLeft} slots available. Please enter a valid amount.`}
                                  </span>
                                </div>
                              )}

                              <div className="name-fields-container">
                                {Array.from({ length: numSlots }).map((_, i) => (
                                  <div key={i} className="name-input-wrapper">
                                    <label className="form-label">Person {i + 1} Name:</label>
                                    <input 
                                      type="text" 
                                      placeholder="First and Last Name"
                                      value={names[i] || ''}
                                      onChange={(e) => handleNameChange(i, e.target.value)}
                                      className={`input-text ${validationErrors[i] ? 'error' : ''}`}
                                    />
                                    {validationErrors[i] && (
                                      <span className="validation-error">
                                        <AlertTriangle size={10} />
                                        {validationErrors[i]}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>

                              <div className="form-actions">
                                <button 
                                  type="submit" 
                                  className="btn-submit"
                                  disabled={isSubmitting || numSlots > mainLeft || validationErrors.some(Boolean)}
                                >
                                  {isSubmitting ? 'Registering...' : 'Sign Up'}
                                </button>
                                <button type="button" onClick={handleCancelSignup} className="btn-cancel">
                                  Cancel
                                </button>
                              </div>
                            </form>
                          ) : (
                            <button
                              disabled={mainLeft <= 0}
                              onClick={() => handleStartSignup(section.sheetName, slot.time, 'main')}
                              className="signup-trigger-btn"
                            >
                              {mainLeft <= 0 ? 'Fully Reserved' : 'Reserve Slots'}
                            </button>
                          )}
                        </div>

                        {/* Optional Wait List Section */}
                        {hasWaitlist && (mainLeft <= 0 || slot.waitSignedUp.length > 0) && (
                          <div className="sub-section-block">
                            <div className="sub-section-title-bar">
                              <span className="sub-section-name">Wait List</span>
                              {waitLeft > 0 ? (
                                <span className="badge badge-limited" style={{ fontSize: '0.7rem' }}>
                                  {waitLeft} of {slot.waitCapacity} Left
                                </span>
                              ) : (
                                <span className="badge badge-full" style={{ fontSize: '0.7rem' }}>Full</span>
                              )}
                            </div>

                            <div className="signed-up-list">
                              {slot.waitSignedUp.length > 0 ? (
                                slot.waitSignedUp.map((name, i) => (
                                  <div key={i} className="signed-up-item">{name}</div>
                                ))
                              ) : (
                                <div className="signed-up-empty">No one on wait list</div>
                              )}
                            </div>

                            {activeSignup?.tab === section.sheetName && 
                             activeSignup?.slot === slot.time && 
                             activeSignup?.type === 'wait' ? (
                              <form onSubmit={handleSubmit} className="signup-form-expand">
                                <div className="form-group">
                                  <label className="form-label">Number of People:</label>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <button 
                                      type="button" 
                                      onClick={() => handleNumSlotsChange(Math.max(1, (numSlots || 1) - 1))}
                                      style={{ padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '1.1rem', cursor: 'pointer', userSelect: 'none' }}
                                    >
                                      -
                                    </button>
                                    <input 
                                      type="number" 
                                      min={1} 
                                      max={waitLeft}
                                      value={isNaN(numSlots) || numSlots === 0 ? '' : numSlots} 
                                      onChange={(e) => handleNumSlotsChange(parseInt(e.target.value))}
                                      onBlur={() => {
                                        if (isNaN(numSlots) || numSlots < 1) {
                                          handleNumSlotsChange(1);
                                        }
                                      }}
                                      className="input-number"
                                      style={{ textAlign: 'center', maxWidth: '80px' }}
                                    />
                                    <button 
                                      type="button" 
                                      onClick={() => handleNumSlotsChange(Math.min(waitLeft, (numSlots || 1) + 1))}
                                      style={{ padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '1.1rem', cursor: 'pointer', userSelect: 'none' }}
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>

                                {numSlots > waitLeft && (
                                  <div className="warning-label">
                                    <AlertTriangle size={14} />
                                    <span>
                                      {waitLeft === 0 
                                        ? "All slots have been taken for this session time." 
                                        : `Only ${waitLeft} waitlist slots available.`}
                                    </span>
                                  </div>
                                )}

                                <div className="name-fields-container">
                                  {Array.from({ length: numSlots }).map((_, i) => (
                                    <div key={i} className="name-input-wrapper">
                                      <label className="form-label">Waitlist Name {i + 1}:</label>
                                      <input 
                                        type="text" 
                                        placeholder="First and Last Name"
                                        value={names[i] || ''}
                                        onChange={(e) => handleNameChange(i, e.target.value)}
                                        className={`input-text ${validationErrors[i] ? 'error' : ''}`}
                                      />
                                      {validationErrors[i] && (
                                        <span className="validation-error">
                                          <AlertTriangle size={10} />
                                          {validationErrors[i]}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                <div className="form-actions">
                                  <button 
                                    type="submit" 
                                    className="btn-submit"
                                    disabled={isSubmitting || numSlots > waitLeft || validationErrors.some(Boolean)}
                                  >
                                    {isSubmitting ? 'Adding...' : 'Join Waitlist'}
                                  </button>
                                  <button type="button" onClick={handleCancelSignup} className="btn-cancel">
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <button
                                disabled={waitLeft <= 0}
                                onClick={() => handleStartSignup(section.sheetName, slot.time, 'wait')}
                                className="signup-trigger-btn"
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}
                              >
                                {waitLeft <= 0 ? 'Waitlist Full' : 'Join Waitlist'}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Optional Priesthood Helpers Section (Baptistry Tab only) */}
                        {hasHelpers && (
                          <div className="sub-section-block">
                            <div className="sub-section-title-bar">
                              <span className="sub-section-name">Priesthood Helpers</span>
                              {helpersLeft > 0 ? (
                                <span className="badge badge-available" style={{ fontSize: '0.7rem', color: 'var(--accent)', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
                                  {helpersLeft} of {slot.helpersCapacity} Left
                                </span>
                              ) : (
                                <span className="badge badge-full" style={{ fontSize: '0.7rem' }}>Full</span>
                              )}
                            </div>

                            <div className="signed-up-list">
                              {slot.helpersSignedUp.length > 0 ? (
                                slot.helpersSignedUp.map((name, i) => (
                                  <div key={i} className="signed-up-item">{name}</div>
                                ))
                              ) : (
                                <div className="signed-up-empty">No helper signups yet</div>
                              )}
                            </div>

                            {activeSignup?.tab === section.sheetName && 
                             activeSignup?.slot === slot.time && 
                             activeSignup?.type === 'helpers' ? (
                              <form onSubmit={handleSubmit} className="signup-form-expand">
                                <div className="form-group">
                                  <label className="form-label">Number of Helpers:</label>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <button 
                                      type="button" 
                                      onClick={() => handleNumSlotsChange(Math.max(1, (numSlots || 1) - 1))}
                                      style={{ padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '1.1rem', cursor: 'pointer', userSelect: 'none' }}
                                    >
                                      -
                                    </button>
                                    <input 
                                      type="number" 
                                      min={1} 
                                      max={helpersLeft}
                                      value={isNaN(numSlots) || numSlots === 0 ? '' : numSlots} 
                                      onChange={(e) => handleNumSlotsChange(parseInt(e.target.value))}
                                      onBlur={() => {
                                        if (isNaN(numSlots) || numSlots < 1) {
                                          handleNumSlotsChange(1);
                                        }
                                      }}
                                      className="input-number"
                                      style={{ textAlign: 'center', maxWidth: '80px' }}
                                    />
                                    <button 
                                      type="button" 
                                      onClick={() => handleNumSlotsChange(Math.min(helpersLeft, (numSlots || 1) + 1))}
                                      style={{ padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '1.1rem', cursor: 'pointer', userSelect: 'none' }}
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>

                                {numSlots > helpersLeft && (
                                  <div className="warning-label">
                                    <AlertTriangle size={14} />
                                    <span>
                                      {helpersLeft === 0 
                                        ? "All slots have been taken for this session time." 
                                        : `Only ${helpersLeft} helper slots available.`}
                                    </span>
                                  </div>
                                )}

                                <div className="name-fields-container">
                                  {Array.from({ length: numSlots }).map((_, i) => (
                                    <div key={i} className="name-input-wrapper">
                                      <label className="form-label">Helper Name {i + 1}:</label>
                                      <input 
                                        type="text" 
                                        placeholder="First and Last Name"
                                        value={names[i] || ''}
                                        onChange={(e) => handleNameChange(i, e.target.value)}
                                        className={`input-text ${validationErrors[i] ? 'error' : ''}`}
                                      />
                                      {validationErrors[i] && (
                                        <span className="validation-error">
                                          <AlertTriangle size={10} />
                                          {validationErrors[i]}
                                        </span>
                                      )}

                                      <label className="form-label" style={{ marginTop: '0.35rem' }}>Office:</label>
                                      <div className="helper-type-group">
                                        <label className="radio-label">
                                          <input
                                            type="radio"
                                            name={`helperType-${i}`}
                                            value="Elder / High Priest"
                                            checked={helperTypes[i] === 'Elder / High Priest'}
                                            onChange={() => handleHelperTypeChange(i, 'Elder / High Priest')}
                                            className="radio-input"
                                          />
                                          Elder / High Priest
                                        </label>
                                        <label className="radio-label">
                                          <input
                                            type="radio"
                                            name={`helperType-${i}`}
                                            value="Priest"
                                            checked={helperTypes[i] === 'Priest'}
                                            onChange={() => handleHelperTypeChange(i, 'Priest')}
                                            className="radio-input"
                                          />
                                          Priest
                                        </label>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <div className="form-actions">
                                  <button 
                                    type="submit" 
                                    className="btn-submit"
                                    style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #d97706 100%)' }}
                                    disabled={isSubmitting || numSlots > helpersLeft || validationErrors.some(Boolean)}
                                  >
                                    {isSubmitting ? 'Signing Up...' : 'Sign Up Helper'}
                                  </button>
                                  <button type="button" onClick={handleCancelSignup} className="btn-cancel">
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <button
                                disabled={helpersLeft <= 0}
                                onClick={() => handleStartSignup(section.sheetName, slot.time, 'helpers')}
                                className="signup-trigger-btn"
                                style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #d97706 100%)', boxShadow: '0 4px 12px var(--accent-glow)' }}
                              >
                                {helpersLeft <= 0 ? 'Helpers Full' : 'Volunteer as Helper'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </main>
    </>
  );
}
