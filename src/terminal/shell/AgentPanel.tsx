import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal, SendHorizontal, BrainCircuit, X, Loader2 } from 'lucide-react';
import { streamAgentChat, type AgentStreamChunk, type GenUIComponent } from '../../services/aiService';
import ChartWidget from '../../components/ChartWidget';

interface AgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSymbol?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  components: GenUIComponent[];
}

export function AgentPanel({ isOpen, onClose, selectedSymbol = 'NVDA' }: AgentPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init',
      role: 'assistant',
      content: `SYSTEM_READY... HERMES_AGENT_ONLINE.\nCurrently tracking: ${selectedSymbol}. How can I assist with your trading strategy?`,
      components: [],
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      components: [],
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', components: [] },
    ]);

    const uiHistory = messages.filter(m => m.id !== 'init').map(m => ({ role: m.role, content: m.content }));

    try {
      await streamAgentChat({
        message: userMessage.content,
        symbol: selectedSymbol,
        history: uiHistory,
        onChunk: (chunk: AgentStreamChunk) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;

              if (chunk.kind === 'text') {
                return { ...m, content: m.content + chunk.delta };
              }
              if (chunk.kind === 'ui_component') {
                return { ...m, components: [...m.components, chunk.component] };
              }
              if (chunk.kind === 'error') {
                return { ...m, content: m.content + `\n\n[SYS_ERROR]: ${chunk.message}` };
              }
              return m;
            })
          );
        },
      });
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: m.content + '\n\n[COMM_LINK_DISCONNECTED]' } : m
        )
      );
    } finally {
      setIsTyping(false);
    }
  };

  const renderComponent = (comp: GenUIComponent, index: number) => {
    if (comp.componentName === 'ChartWidget') {
      const sym = typeof comp.props.symbol === 'string' ? comp.props.symbol : selectedSymbol;
      return (
        <div key={index} className="mt-4 border border-(--color-term-accent)/30 overflow-hidden rounded bg-(--color-term-bg)/50 p-2 h-64">
           <div className="text-[10px] text-(--color-term-accent) mb-2 opacity-80 flex items-center gap-2">
             <BrainCircuit className="h-3 w-3" />
             [GEN_UI: {comp.componentName}]
           </div>
           {/* Fallback to non-live mode wrapper for now */}
           <ChartWidget symbol={sym} />
        </div>
      );
    }
    // Fallback for other components
    return (
      <div key={index} className="mt-4 p-3 border border-(--color-term-subtle) bg-(--color-term-bg) text-[11px] font-mono text-(--color-term-muted)">
        <div className="text-(--color-term-accent) mb-1">[COMPONENT_RENDER: {comp.componentName}]</div>
        <pre>{JSON.stringify(comp.props, null, 2)}</pre>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
          className="fixed top-0 right-0 z-50 flex h-screen w-96 flex-col border-l border-(--color-term-border-strong) bg-(--color-term-panel) shadow-[-10px_0_30px_rgba(0,0,0,0.5)] font-mono"
        >
          {/* Header */}
          <div className="flex h-14 items-center justify-between border-b border-(--color-term-border) bg-(--color-term-surface) px-4">
            <div className="flex items-center gap-3 text-(--color-term-accent)">
              <BrainCircuit className="h-4 w-4" />
              <span className="text-[13px] font-bold tracking-[0.2em]">HERMES_AI</span>
            </div>
            <button
              onClick={onClose}
              className="text-(--color-term-muted) hover:text-(--color-term-text) transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Chat History */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex w-full flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-2 mb-1 opacity-60">
                  {msg.role === 'assistant' ? (
                    <Terminal className="h-3 w-3 text-(--color-term-accent)" />
                  ) : (
                    <div className="h-2 w-2 bg-(--color-term-positive) rounded-full" />
                  )}
                  <span className="text-[9px] tracking-widest text-(--color-term-text) uppercase">
                    {msg.role === 'assistant' ? 'SYS.AGENT' : 'OPERATOR'}
                  </span>
                </div>
                <div
                  className={`max-w-[90%] border p-3 text-[13px] leading-relaxed tracking-wide ${
                    msg.role === 'user'
                      ? 'border-(--color-term-border-strong) bg-(--color-term-surface) text-(--color-term-text)'
                      : 'border-(--color-term-accent)/20 bg-(--color-term-accent)/5 text-(--color-term-accent-soft)'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  {msg.role === 'assistant' && msg.content === '' && isTyping && msg === messages[messages.length - 1] && (
                    <div className="flex gap-1 mt-2">
                      <span className="h-1.5 w-1.5 animate-pulse bg-(--color-term-accent)" />
                      <span className="h-1.5 w-1.5 animate-pulse bg-(--color-term-accent) delay-75" />
                      <span className="h-1.5 w-1.5 animate-pulse bg-(--color-term-accent) delay-150" />
                    </div>
                  )}
                  {msg.components.map(renderComponent)}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSubmit} className="border-t border-(--color-term-border) bg-(--color-term-surface) p-4">
            <div className="relative flex items-center">
              <Terminal className="absolute left-3 h-4 w-4 text-(--color-term-muted)" />
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Awaiting command..."
                className="h-10 w-full border border-(--color-term-border-strong) bg-(--color-term-bg) pl-10 pr-12 text-[12px] tracking-wide text-(--color-term-text) placeholder:text-(--color-term-muted) focus:border-(--color-term-accent) focus:outline-none"
                disabled={isTyping}
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className="absolute right-2 flex h-6 w-6 items-center justify-center text-(--color-term-accent) hover:text-(--color-term-positive) disabled:opacity-30 transition-colors"
              >
                {isTyping ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
              </button>
            </div>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
