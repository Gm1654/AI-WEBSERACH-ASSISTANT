"use client";

import { useState, useRef, useEffect } from 'react';
import { Mic, Send, Square, Sun, Moon, Menu, Settings, MessageSquarePlus, Clock, Star, Book, Bot, Search, Code, FileText, Lightbulb, Loader2, Edit2, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Status = 'idle' | 'listening' | 'searching';

export default function Home() {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<string>('');
  const [currentQuery, setCurrentQuery] = useState<string>('');
  const [textInput, setTextInput] = useState<string>('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  const recognitionRef = useRef<any>(null);
  const utterancesRef = useRef<SpeechSynthesisUtterance[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = async (event: any) => {
          const transcript = event.results[0][0].transcript;
          handleQuery(transcript);
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setStatus('idle');
        };

        recognitionRef.current.onend = () => {
          setStatus((prev) => prev === 'listening' ? 'idle' : prev);
        };
      }
    }
  }, []);

  const handleQuery = async (query: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStatus('searching');
    setResult('');
    setCurrentQuery(query);
    setTextInput('');
    stopSpeaking();

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });
      const data = await response.json();
      
      if (abortControllerRef.current !== controller) return;
      
      setResult(data.answer);
      setStatus('idle');
      speak(data.answer);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        if (abortControllerRef.current === controller) {
          setStatus('idle');
          setResult('Generation stopped by user.');
        }
        return;
      }
      
      if (abortControllerRef.current !== controller) return;
      
      console.error('Error fetching answer:', error);
      const fallback = "I could not find verified information on this. Please try rephrasing.";
      setResult(fallback);
      setStatus('idle');
      speak(fallback);
    }
  };

  const stopSearch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setStatus('idle');
      setResult('Generation stopped by user.');
    }
  };

  const handleEdit = () => {
    if (status === 'searching') {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setStatus('idle');
      setResult('Generation stopped to edit query.');
    }
    setEditValue(currentQuery);
    setIsEditing(true);
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editValue.trim()) return;
    setIsEditing(false);
    handleQuery(editValue);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const chunkText = (text: string): string[] => {
    const clean = text
      .replace(/#{1,6}\s+/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/^\|.*\|$/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .trim();

    const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      if ((current + sentence).length > 200) {
        if (current.trim()) chunks.push(current.trim());
        current = sentence;
      } else {
        current += sentence;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  };

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    stopSpeaking();

    const chunks = chunkText(text);
    utterancesRef.current = [];
    let index = 0;

    window.speechSynthesis.cancel();
    setTimeout(() => {
      setIsSpeaking(true);
      index = 0;
      const speakChain = () => {
        if (index >= chunks.length) {
          setIsSpeaking(false);
          return;
        }
        const utterance = new SpeechSynthesisUtterance(chunks[index]);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        utterance.onend = () => {
          index++;
          speakChain();
        };
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
        index++;
      };
      speakChain();
    }, 100);
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  const handleMicClick = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser. Try Chrome or Edge.");
      return;
    }
    if (status === 'idle') {
      stopSpeaking();
      setResult('');
      setStatus('listening');
      recognitionRef.current.start();
    } else if (status === 'listening') {
      recognitionRef.current.stop();
      setStatus('idle');
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (textInput.trim() === '' || status !== 'idle') return;
    stopSpeaking();
    handleQuery(textInput);
  };

  // Mic animation variants
  const pulseVariants: Variants = {
    idle: { scale: 1, opacity: 0.5 },
    listening: { scale: [1, 1.4, 1], opacity: [0.3, 0.8, 0.3], transition: { repeat: Infinity, duration: 1.5, ease: 'easeInOut' as const } },
    searching: { scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5], transition: { repeat: Infinity, duration: 1, ease: 'easeInOut' as const } }
  };

  const renderHeader = () => {
    if (isEditing) {
      return (
        <form onSubmit={saveEdit} style={{ marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.5rem', width: '100%' }}>
          <input 
            autoFocus
            value={editValue} 
            onChange={(e) => setEditValue(e.target.value)} 
            className="input-field" 
            style={{ flex: 1, background: 'var(--input-bg)', padding: '0.5rem 1rem', borderRadius: '12px', border: '1px solid var(--border)' }}
          />
          <button type="submit" className="action-button primary" style={{ width: 'auto', padding: '0 1rem', borderRadius: '12px', fontSize: '0.9rem' }}>Save & Submit</button>
          <button type="button" onClick={() => setIsEditing(false)} className="action-button" style={{ width: 'auto', padding: '0 1rem', borderRadius: '12px', fontSize: '0.9rem', border: '1px solid var(--border)' }}>Cancel</button>
        </form>
      );
    }
    return (
      <div style={{ marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ background: 'var(--surface-hover)', padding: '0.5rem', borderRadius: '50%', display: 'flex' }}>
            <Search size={18} />
          </div>
          {currentQuery}
        </h2>
        <button onClick={handleEdit} className="icon-button" style={{ width: 32, height: 32 }} title="Edit Query">
          <Edit2 size={16} />
        </button>
      </div>
    );
  };

  return (
    <div className="app-layout">
      {/* SIDEBAR */}
      <aside className={`sidebar ${!sidebarOpen ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <Bot size={20} />
          </div>
          <span className="sidebar-title">Nova AI</span>
        </div>
        
        <nav className="sidebar-nav">
          <div className="nav-item active" onClick={() => { setResult(''); setCurrentQuery(''); setStatus('idle'); stopSpeaking(); }}>
            <MessageSquarePlus size={18} />
            <span>New Chat</span>
          </div>
          <div className="nav-item">
            <Star size={18} />
            <span>Favorites</span>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="nav-item">
            <Book size={18} />
            <span>Documentation</span>
          </div>
          <div className="nav-item">
            <Settings size={18} />
            <span>Settings</span>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        
        {/* NAVBAR */}
        <header className="navbar">
          <div className="nav-left">
            <button className="icon-button" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <Menu size={20} />
            </button>
            {!sidebarOpen && <span style={{ fontWeight: 600 }}>Nova AI</span>}
          </div>
          <div className="nav-right">
            <button className="icon-button" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="icon-button">
              <Settings size={18} />
            </button>
          </div>
        </header>

        {/* CHAT AREA */}
        <div className="chat-container">
          
          <AnimatePresence mode="wait">
            {status === 'searching' ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="result-card markdown-content"
              >
                {renderHeader()}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)', fontSize: '1rem', marginBottom: '1.5rem' }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                    <Loader2 size={24} />
                  </motion.div>
                  <span>Thinking...</span>
                </div>
                <button 
                  onClick={stopSearch}
                  className="stop-reading-pill"
                  style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none', display: 'inline-flex', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  <Square size={14} fill="currentColor" /> Stop Generating
                </button>
              </motion.div>
            ) : !result ? (
              <motion.div 
                key="empty-state"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="hero-empty"
              >
                {/* Animated Microphone */}
                <div className="mic-container" onClick={handleMicClick} style={{ cursor: 'pointer' }}>
                  <motion.div
                    className="mic-ring"
                    variants={pulseVariants}
                    animate={status}
                    style={{
                      position: 'absolute',
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      background: status === 'listening' ? 'var(--red-bg)' : 'var(--accent-glow)',
                      border: `1px solid ${status === 'listening' ? 'var(--red-border)' : 'var(--accent-glow)'}`,
                      zIndex: 1
                    }}
                  />
                  <div style={{
                    width: 72, height: 72, borderRadius: '50%', 
                    background: status === 'listening' ? 'var(--red-bg)' : 'var(--surface)', 
                    border: `1px solid ${status === 'listening' ? 'var(--red)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
                    color: status === 'listening' ? 'var(--red)' : 'var(--text-secondary)',
                    transition: 'all 0.3s'
                  }}>
                    <Mic size={32} />
                  </div>
                </div>

                <h1 className="hero-title">How can I help you today?</h1>
                <p className="hero-subtitle">Type a message or start speaking.</p>

                {/* Suggestion Chips & Mocks */}
                {status === 'idle' && (
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                    className="mockup-grid"
                  >
                    <div className="mockup-section">
                      <h3>Suggestions</h3>
                      <div className="glass-card" onClick={() => handleQuery("Explain MCP")}>
                        <h4><Lightbulb size={16} /> Explain MCP</h4>
                        <p>Learn about Model Context Protocol</p>
                      </div>
                      <div className="glass-card" onClick={() => handleQuery("Search the web for top AI news")}>
                        <h4><Search size={16} /> Search the web</h4>
                        <p>Find real-time information</p>
                      </div>
                    </div>
                    
                    <div className="mockup-section">
                      <h3>Recent</h3>
                      <div className="glass-card">
                        <h4><Code size={16} /> Build AI Agent</h4>
                        <p>Yesterday</p>
                      </div>
                      <div className="glass-card">
                        <h4><FileText size={16} /> Document Summary</h4>
                        <p>2 days ago</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="result-card markdown-content"
              >
                {renderHeader()}
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />
                  }}
                >
                  {result}
                </ReactMarkdown>
                
                <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}>
                  <button onClick={handleCopy} className="icon-button" style={{ width: 'auto', padding: '0 0.75rem', display: 'flex', gap: '0.5rem', fontSize: '0.85rem' }}>
                    {copied ? <Check size={16} color="var(--accent)" /> : <Copy size={16} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button onClick={() => { setTextInput(''); (document.querySelector('.input-field') as HTMLInputElement)?.focus(); }} className="icon-button" style={{ width: 'auto', padding: '0 0.75rem', display: 'flex', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <MessageSquarePlus size={16} />
                    New Chat
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>

        {/* FLOATING INPUT */}
        <div className="input-wrapper">
          {isSpeaking && (
            <div style={{ position: 'absolute', top: -48, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={stopSpeaking}
                className="stop-reading-pill"
                style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none' }}
              >
                <Square size={14} fill="currentColor" /> Stop Reading
              </motion.button>
            </div>
          )}

          <form onSubmit={handleTextSubmit} className="floating-input-box" suppressHydrationWarning>
            <Search size={20} color="var(--text-muted)" />
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Ask anything..."
              className="input-field"
              disabled={status !== 'idle'}
              suppressHydrationWarning
            />
            <button 
              type="button" 
              className="action-button"
              onClick={handleMicClick}
              style={{ color: status === 'listening' ? 'var(--red)' : '' }}
              suppressHydrationWarning
            >
              <Mic size={20} />
            </button>
            {status === 'searching' ? (
              <button 
                type="button" 
                className="action-button primary"
                onClick={stopSearch}
                title="Stop Generating"
                suppressHydrationWarning
              >
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button 
                type="submit" 
                className="action-button primary"
                disabled={status !== 'idle' || !textInput.trim()}
                suppressHydrationWarning
              >
                <Send size={18} />
              </button>
            )}
          </form>
        </div>
        
      </main>
    </div>
  );
}
