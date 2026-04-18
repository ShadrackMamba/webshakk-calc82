import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Linking, ActivityIndicator,
  StyleSheet, ScrollView, Modal, Dimensions, StatusBar, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// ═══════════════════════════════════════════
// ENGINE
// ═══════════════════════════════════════════
const Engine = (() => {
  function toRad(val, mode) {
    if (mode === 'RAD')  return val;
    if (mode === 'GRAD') return val * Math.PI / 200;
    return val * Math.PI / 180;
  }
  function fromRad(val, mode) {
    if (mode === 'RAD')  return val;
    if (mode === 'GRAD') return val * 200 / Math.PI;
    return val * 180 / Math.PI;
  }
  function factorial(n) {
    n = Math.round(n);
    if (n < 0 || n > 69) throw new Error('Math ERROR');
    if (n <= 1) return 1;
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }
  function nPr(n, r) {
    n = Math.round(n); r = Math.round(r);
    if (r > n || r < 0 || n < 0) throw new Error('Math ERROR');
    return factorial(n) / factorial(n - r);
  }
  function nCr(n, r) {
    n = Math.round(n); r = Math.round(r);
    if (r > n || r < 0 || n < 0) throw new Error('Math ERROR');
    return factorial(n) / (factorial(r) * factorial(n - r));
  }
  function roundResult(val) {
    if (!isFinite(val) || isNaN(val)) throw new Error('Math ERROR');
    return Math.round(val * 1e10) / 1e10;
  }
  function applyFunction(name, val, angleMode = 'DEG') {
    switch (name) {
      case 'sin':   return roundResult(Math.sin(toRad(val, angleMode)));
      case 'cos':   return roundResult(Math.cos(toRad(val, angleMode)));
      case 'tan': {
        const rad = toRad(val, angleMode);
        if (Math.abs(Math.cos(rad)) < 1e-14) throw new Error('Math ERROR');
        return roundResult(Math.sin(rad) / Math.cos(rad));
      }
      case 'asin':
        if (val < -1 || val > 1) throw new Error('Math ERROR');
        return roundResult(fromRad(Math.asin(val), angleMode));
      case 'acos':
        if (val < -1 || val > 1) throw new Error('Math ERROR');
        return roundResult(fromRad(Math.acos(val), angleMode));
      case 'atan':  return roundResult(fromRad(Math.atan(val), angleMode));
      case 'sinh':  return roundResult(Math.sinh(val));
      case 'cosh':  return roundResult(Math.cosh(val));
      case 'tanh':  return roundResult(Math.tanh(val));
      case 'asinh': return roundResult(Math.asinh(val));
      case 'acosh':
        if (val < 1) throw new Error('Math ERROR');
        return roundResult(Math.acosh(val));
      case 'atanh':
        if (val <= -1 || val >= 1) throw new Error('Math ERROR');
        return roundResult(Math.atanh(val));
      case 'log':
        if (val <= 0) throw new Error('Math ERROR');
        return roundResult(Math.log10(val));
      case 'ln':
        if (val <= 0) throw new Error('Math ERROR');
        return roundResult(Math.log(val));
      case 'sqrt':
        if (val < 0) throw new Error('Math ERROR');
        return roundResult(Math.sqrt(val));
      case 'cbrt':  return roundResult(Math.cbrt(val));
      case 'exp':   return roundResult(Math.exp(val));
      case 'abs':   return Math.abs(val);
      case 'fact':  return factorial(val);
      case 'neg':   return -val;
      case 'sq':    return roundResult(val * val);
      case 'cube':  return roundResult(val * val * val);
      default: throw new Error('Unknown fn: ' + name);
    }
  }
  function formatResult(val) {
    if (!isFinite(val) || isNaN(val)) return 'Math ERROR';
    if (Number.isInteger(val) && Math.abs(val) < 1e15) return val.toString();
    const abs = Math.abs(val);
    if (abs !== 0 && (abs >= 1e10 || abs < 0.001)) {
      let s = val.toExponential(6);
      s = s.replace(/\.?0+(e)/, '$1');
      return s;
    }
    return parseFloat(val.toPrecision(10)).toString();
  }
  function toFraction(val, maxDenom = 9999) {
    if (!isFinite(val)) return null;
    if (Number.isInteger(val)) return { n: val, d: 1 };
    const sign = val < 0 ? -1 : 1;
    const abs = Math.abs(val);
    const whole = Math.floor(abs);
    const frac = abs - whole;
    if (frac < 1e-10) return { n: sign * whole, d: 1 };
    let best = { n: 1, d: 1, err: Infinity };
    for (let d = 2; d <= maxDenom; d++) {
      const n = Math.round(frac * d);
      const err = Math.abs(frac - n / d);
      if (err < best.err) best = { n, d, err };
      if (err < 1e-9) break;
    }
    return { n: sign * (whole * best.d + best.n), d: best.d };
  }
  function formatFraction(val) {
    const f = toFraction(val);
    if (!f) return formatResult(val);
    if (f.d === 1) return String(f.n);
    const sign = f.n < 0 ? -1 : 1;
    const absN = Math.abs(f.n);
    const whole = Math.floor(absN / f.d);
    const num = absN % f.d;
    if (whole === 0) return `${sign < 0 ? '-' : ''}${num}/${f.d}`;
    return `${sign < 0 ? '-' : ''}${whole}_${num}/${f.d}`;
  }
  function toDMS(decimal) {
    const sign = decimal < 0 ? -1 : 1;
    const abs = Math.abs(decimal);
    const d = Math.floor(abs);
    const mFull = (abs - d) * 60;
    const m = Math.floor(mFull);
    const s = parseFloat(((mFull - m) * 60).toFixed(6));
    return { d: sign * d, m, s };
  }
  function toEngineering(val) {
    if (val === 0) return '0';
    const sign = val < 0 ? '-' : '';
    const abs = Math.abs(val);
    const exp = Math.floor(Math.log10(abs));
    const engExp = Math.floor(exp / 3) * 3;
    const mantissa = parseFloat((abs / Math.pow(10, engExp)).toPrecision(7));
    return `${sign}${mantissa}×10^${engExp}`;
  }
  function randomDigit() { return Math.floor(Math.random() * 10); }
  function randomNum() { return parseFloat(Math.random().toFixed(9)); }
  return { applyFunction, roundResult, formatResult, factorial, nPr, nCr, toFraction, formatFraction, toDMS, toRad, fromRad, toEngineering, randomDigit, randomNum };
})();

// ═══════════════════════════════════════════
// PARSER
// ═══════════════════════════════════════════
const Parser = (() => {
  const OPS = {
    '+':    { prec: 1, assoc: 'L' },
    '-':    { prec: 1, assoc: 'L' },
    '×':    { prec: 2, assoc: 'L' },
    '÷':    { prec: 2, assoc: 'L' },
    '^':    { prec: 4, assoc: 'R' },
    '_neg': { prec: 3, assoc: 'R' },
  };
  const FUNCTIONS1 = new Set(['sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','asinh','acosh','atanh','log','ln','sqrt','cbrt','abs','exp','fact','neg','sq','cube']);
  const FUNCTIONS2 = new Set(['nCr','nPr']);

  function tokenize(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
      const ch = expr[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (/[0-9.]/.test(ch)) {
        let num = '';
        while (i < expr.length && /[0-9.]/.test(expr[i])) num += expr[i++];
        tokens.push({ type: 'number', value: num }); continue;
      }
      if (/[a-zA-Z_]/.test(ch)) {
        let name = '';
        while (i < expr.length && /[a-zA-Z_0-9]/.test(expr[i])) name += expr[i++];
        if (name === 'pi') tokens.push({ type: 'number', value: String(Math.PI) });
        else if (FUNCTIONS1.has(name)) tokens.push({ type: 'function1', value: name });
        else if (FUNCTIONS2.has(name)) tokens.push({ type: 'function2', value: name });
        else tokens.push({ type: 'number', value: '0' });
        continue;
      }
      if (ch === 'π') { tokens.push({ type: 'number', value: String(Math.PI) }); i++; continue; }
      if (ch === '+') { tokens.push({ type: 'operator', value: '+' }); i++; continue; }
      if (ch === '-') { tokens.push({ type: 'operator', value: '-' }); i++; continue; }
      if (ch === '×') { tokens.push({ type: 'operator', value: '×' }); i++; continue; }
      if (ch === '÷') { tokens.push({ type: 'operator', value: '÷' }); i++; continue; }
      if (ch === '^') { tokens.push({ type: 'operator', value: '^' }); i++; continue; }
      if (ch === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
      if (ch === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
      if (ch === ',') { tokens.push({ type: 'comma' }); i++; continue; }
      i++;
    }
    return insertImplicitMul(fixUnaryMinus(tokens));
  }
  function fixUnaryMinus(tokens) {
    const result = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const prev = result[result.length - 1];
      if (tok.type === 'operator' && tok.value === '-' &&
          (!prev || prev.type === 'operator' || prev.type === 'lparen' || prev.type === 'comma')) {
        result.push({ type: 'operator', value: '_neg' });
      } else { result.push(tok); }
    }
    return result;
  }
  function insertImplicitMul(tokens) {
    const out = [];
    for (let i = 0; i < tokens.length; i++) {
      const cur = tokens[i];
      const prev = out[out.length - 1];
      if (prev && cur) {
        const prevIsVal = prev.type === 'number' || prev.type === 'rparen';
        const curIsVal = cur.type === 'number' || cur.type === 'lparen' || cur.type === 'function1' || cur.type === 'function2';
        if (prevIsVal && curIsVal) out.push({ type: 'operator', value: '×' });
      }
      out.push(cur);
    }
    return out;
  }
  function toRPN(tokens) {
    const output = [], opStack = [];
    const peek = () => opStack[opStack.length - 1];
    for (const tok of tokens) {
      if (tok.type === 'number') { output.push(tok); }
      else if (tok.type === 'function1' || tok.type === 'function2') { opStack.push(tok); }
      else if (tok.type === 'comma') { while (peek() && peek().type !== 'lparen') output.push(opStack.pop()); }
      else if (tok.type === 'operator') {
        const info = OPS[tok.value];
        if (!info) continue;
        while (peek() && peek().type !== 'lparen' &&
          (peek().type === 'function1' || peek().type === 'function2' ||
            (OPS[peek().value] && (OPS[peek().value].prec > info.prec ||
              (OPS[peek().value].prec === info.prec && info.assoc === 'L'))))) {
          output.push(opStack.pop());
        }
        opStack.push(tok);
      }
      else if (tok.type === 'lparen') { opStack.push(tok); }
      else if (tok.type === 'rparen') {
        while (peek() && peek().type !== 'lparen') output.push(opStack.pop());
        if (peek() && peek().type === 'lparen') opStack.pop();
        if (peek() && (peek().type === 'function1' || peek().type === 'function2')) output.push(opStack.pop());
      }
    }
    while (opStack.length) output.push(opStack.pop());
    return output;
  }
  function evalRPN(rpn, angleMode) {
    const stack = [];
    for (const tok of rpn) {
      if (tok.type === 'number') { stack.push(parseFloat(tok.value)); continue; }
      if (tok.type === 'operator') {
        if (tok.value === '_neg') { stack.push(-stack.pop()); continue; }
        const b = stack.pop(), a = stack.pop();
        if (a === undefined || b === undefined) throw new Error('Syntax ERROR');
        switch (tok.value) {
          case '+': stack.push(a + b); break;
          case '-': stack.push(a - b); break;
          case '×': stack.push(a * b); break;
          case '÷': if (b === 0) throw new Error('Math ERROR'); stack.push(a / b); break;
          case '^': stack.push(Math.pow(a, b)); break;
          default: throw new Error('Unknown op');
        }
        continue;
      }
      if (tok.type === 'function1') {
        if (!stack.length) throw new Error('Syntax ERROR');
        stack.push(Engine.applyFunction(tok.value, stack.pop(), angleMode)); continue;
      }
      if (tok.type === 'function2') {
        if (stack.length < 2) throw new Error('Syntax ERROR');
        const b = stack.pop(), a = stack.pop();
        if (tok.value === 'nCr') stack.push(Engine.nCr(a, b));
        else if (tok.value === 'nPr') stack.push(Engine.nPr(a, b));
        continue;
      }
    }
    if (stack.length !== 1) throw new Error('Syntax ERROR');
    const result = stack[0];
    if (!isFinite(result) || isNaN(result)) throw new Error('Math ERROR');
    return result;
  }
  function parse(expr, angleMode = 'DEG') {
    const tokens = tokenize(expr);
    const rpn = toRPN(tokens);
    return evalRPN(rpn, angleMode);
  }
  return { parse };
})();

// ═══════════════════════════════════════════
// BUTTON LAYOUT
// ═══════════════════════════════════════════
const ROWS = [
  // Row 1: SHIFT ALPHA [special dpad] MODE CLR — handled separately
  null,
  // Row 2
  [
    { shift:'x!', main:'x⁻¹', action:'RECIP', sAction:'function', sValue:'fact' },
    { shift:'nPr', main:'nCr', action:'nCr', sAction:'nPr' },
    { shift:'a↔d', main:'d/c', action:'FRAC_DEC', sAction:'FRAC_DEC' },
    { shift:'←', main:'Rec↑', action:'function2', value:'Rec', sAction:'cursor_left' },
    { shift:'Rec', main:'Pol', action:'function2', value:'Pol', sAction:'function2', sValue:'Rec' },
    { shift:'x³', main:'x²', action:'SQ', sAction:'CUBE' },
  ],
  // Row 3
  [
    { shift:'b/c', main:'a b/c', action:'FRAC_INPUT', sAction:'FRAC_NEXT' },
    { shift:'∛', main:'√', action:'function', value:'sqrt', sAction:'function', sValue:'cbrt' },
    { shift:'xʸ', main:'x²', action:'SQ', sAction:'operator', sValue:'^' },
    { shift:'ʸ√', main:'^', action:'operator', value:'^', sAction:'YROOT' },
    { shift:'eˣ', main:'10^x', action:'POW10', sAction:'function', sValue:'exp' },
    { shift:'10ˣ', main:'log', action:'function', value:'log', sAction:'POW10' },
    { shift:'eˣ', main:'ln', action:'function', value:'ln', sAction:'function', sValue:'exp' },
  ],
  // Row 4
  [
    { shift:'DMS', main:'(-)', action:'NEG', sAction:'DMS' },
    { shift:'▶', main:'◀▶', action:'cursor_left', sAction:'cursor_right' },
    { shift:'HYP', main:'hyp', action:'HYP', sAction:'HYP' },
    { shift:'sin⁻¹', main:'sin', action:'TRIG', value:'sin', sAction:'TRIG', sValue:'asin' },
    { shift:'cos⁻¹', main:'cos', action:'TRIG', value:'cos', sAction:'TRIG', sValue:'acos' },
    { shift:'tan⁻¹', main:'tan', action:'TRIG', value:'tan', sAction:'TRIG', sValue:'atan' },
  ],
  // Row 5
  [
    { shift:'STO', main:'STO', action:'STO', sAction:'STO' },
    { shift:'MC', main:'RCL', action:'MR', sAction:'MC' },
    { shift:'←ENG', main:'ENG', action:'ENG', sAction:'ENG' },
    { shift:'|x|', main:'(', action:'lparen', sAction:'function', sValue:'abs' },
    { shift:'x!', main:')', action:'rparen', sAction:'function', sValue:'fact' },
    { shift:'M', main:'M-', action:'M_MINUS', sAction:'M_MINUS', alphaTop:'M' },
    { shift:'M', main:'M+', action:'M_PLUS', sAction:'M_PLUS', alphaTop:'M', variant:'blue' },
  ],
  // Row 6
  [
    { main:'7', action:'digit', value:'7', variant:'num' },
    { main:'8', action:'digit', value:'8', variant:'num' },
    { main:'9', action:'digit', value:'9', variant:'num' },
    { shift:'INS', main:'DEL', action:'DEL', sAction:'DEL', variant:'del' },
    { main:'AC', action:'AC', sAction:'AC', shift:'OFF', variant:'ac' },
  ],
  // Row 7
  [
    { main:'4', action:'digit', value:'4', variant:'num' },
    { main:'5', action:'digit', value:'5', variant:'num' },
    { main:'6', action:'digit', value:'6', variant:'num' },
    { main:'×', action:'operator', value:'×', variant:'op' },
    { main:'÷', action:'operator', value:'÷', variant:'op' },
  ],
  // Row 8
  [
    { shift:'S-SUM', main:'1', action:'digit', value:'1', sAction:'STAT_SUM', variant:'num' },
    { shift:'S-VAR', main:'2', action:'digit', value:'2', sAction:'STAT_VAR', variant:'num' },
    { main:'3', action:'digit', value:'3', variant:'num' },
    { main:'+', action:'operator', value:'+', variant:'op' },
    { main:'−', action:'operator', value:'-', variant:'op' },
  ],
  // Row 9
  [
    { shift:'Rnd', main:'0', action:'digit', value:'0', sAction:'RND', alphaTop:'Ran#', aAction:'RAN', variant:'num' },
    { main:'·', action:'dot', alphaTop:'π', aAction:'constant', aValue:'π', variant:'num' },
    { shift:'DRG▸', main:'×10ˣ', action:'SCI_NOT', sAction:'DRG' },
    { main:'Ans', action:'ANS', alphaTop:'Ans', aAction:'ANS' },
    { main:'=', action:'equals', variant:'eq' },
  ],
];

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════
export default function App() {
  const [appStatus, setAppStatus]     = useState('loading');
  const [remoteData, setRemoteData]   = useState(null);
  const [hideMsg, setHideMsg]         = useState(false);
  const [locked, setLocked]           = useState(false);
  const CURRENT_VERSION = Constants.expoConfig?.version || '1.0.0';

  // Calculator state
  const [expression, setExpression]   = useState('');
  const [result, setResult]           = useState('');
  const [cursorPos, setCursorPos]     = useState(0);
  const [angleMode, setAngleMode]     = useState('DEG');
  const [shiftActive, setShiftActive] = useState(false);
  const [alphaActive, setAlphaActive] = useState(false);
  const [memActive, setMemActive]     = useState(false);
  const [engMode, setEngMode]         = useState(false);
  const [fracMode, setFracMode]       = useState(false);
  const [hypNext, setHypNext]         = useState(false);
  const [isError, setIsError]         = useState(false);
  const [justEval, setJustEval]       = useState(false);
  const [showMode, setShowMode]       = useState(false);
  const [showAbout, setShowAbout]     = useState(false);
  const [fracInput, setFracInput]     = useState(false);
  const [fracParts, setFracParts]     = useState(['','','']);
  const [fracStage, setFracStage]     = useState(1);
  const [history, setHistory]         = useState([]);
  const [histIdx, setHistIdx]         = useState(-1);
  const [blinkOn, setBlinkOn]         = useState(true);

  const memRef    = useRef(0);
  const ansRef    = useRef(0);
  const stateRef  = useRef({});

  // keep stateRef in sync for use inside handleButton
  stateRef.current = { expression, result, cursorPos, angleMode, shiftActive, alphaActive, memActive, engMode, fracMode, hypNext, isError, justEval, fracInput, fracParts, fracStage, history, histIdx };

  // Blink cursor
  useEffect(() => {
    const t = setInterval(() => setBlinkOn(b => !b), 500);
    return () => clearInterval(t);
  }, []);

  // Load lock
  useEffect(() => {
    AsyncStorage.getItem('app_locked').then(v => {
      if (v === 'true') { setLocked(true); setAppStatus('blocked'); }
    });
  }, []);

  // Version check
  useEffect(() => {
    const check = async () => {
      try {
        const res  = await fetch('https://webshakk-app-control.vercel.app/apps/calc82/version.json');
        const json = await res.json();
        setRemoteData(json);
        const blocked = json.forceUpdate && json.version !== CURRENT_VERSION;
        if (blocked) {
          setAppStatus('blocked'); setLocked(true);
          await AsyncStorage.setItem('app_locked', 'true');
        } else { setAppStatus('allowed'); }
      } catch {
        setAppStatus(locked ? 'blocked' : 'allowed');
      }
    };
    check();
  }, [locked]);

  // ── helpers that batch-update state ──────────────────────────
  const ins = useCallback((text, expr, pos) => {
    const b = expr.slice(0, pos);
    const a = expr.slice(pos);
    return { expr: b + text + a, pos: pos + text.length };
  }, []);

  const doEvaluate = useCallback((expr, mode, eng, frac) => {
    if (!expr) return null;
    try {
      let e = expr.replace(/Ans/g, `(${ansRef.current})`).replace(/π/g, `(${Math.PI})`);
      const val = Parser.parse(e, mode);
      ansRef.current = val;
      let res;
      if (eng)  res = Engine.toEngineering(val);
      else if (frac) res = Engine.formatFraction(val);
      else res = Engine.formatResult(val);
      return { val, res, error: false };
    } catch(e) {
      return { val: 0, res: e.message || 'Syntax ERROR', error: true };
    }
  }, []);

  // ── main button handler ───────────────────────────────────────
  const handleButton = useCallback((action, value) => {
    const s = stateRef.current;
    let expr     = s.expression;
    let pos      = s.cursorPos;
    let shift    = s.shiftActive;
    let alpha    = s.alphaActive;
    let hyp      = s.hypNext;
    let jeval    = s.justEval;
    let fi       = s.fracInput;
    let fp       = [...s.fracParts];
    let fs       = s.fracStage;
    let ang      = s.angleMode;
    let eng      = s.engMode;
    let frac     = s.fracMode;
    let err      = s.isError;

    // Resolve shift/alpha
    let act = action, val = value || '';

    // Fraction input mode
    if (fi) {
      if (act === 'digit') {
        fp[fs] = (fp[fs] || '') + val;
        const disp = _fracDisplay(fp, fs);
        setFracParts(fp); setFracStage(fs);
        setExpression(disp); setCursorPos(disp.length); return;
      }
      if (act === 'FRAC_INPUT' || act === 'FRAC_NEXT') {
        if (fs < 2) { const ns = fs + 1; setFracStage(ns); const disp = _fracDisplay(fp, ns); setExpression(disp); setCursorPos(disp.length); } return;
      }
      if (act === 'DEL') {
        const p = fp[fs] || '';
        if (p.length > 0) { fp[fs] = p.slice(0,-1); }
        else if (fs > 0) { const ns = fs-1; setFracStage(ns); setFracParts(fp); const disp = _fracDisplay(fp, ns); setExpression(disp); setCursorPos(disp.length); return; }
        setFracParts(fp); const disp = _fracDisplay(fp, fs); setExpression(disp); setCursorPos(disp.length); return;
      }
      if (act === 'AC') { _allClear(); return; }
      if (act === 'equals' || act === 'operator') {
        const committed = _commitFrac(fp);
        if (act === 'equals') {
          const r = doEvaluate(committed, ang, eng, frac);
          if (r) { setExpression(committed); setCursorPos(committed.length); setResult(r.res); setIsError(r.error); setJustEval(true); }
        } else {
          const { expr: ne, pos: np } = ins(val, committed, committed.length);
          setExpression(ne); setCursorPos(np);
        }
        setFracInput(false); setFracParts(['','','']); setFracStage(1); setShiftActive(false); setAlphaActive(false); return;
      }
    }

    // Error: any key clears
    if (err && act !== 'AC' && act !== 'DEL') { _allClear(); return; }

    // After eval: digit starts fresh, operator continues with Ans
    if (jeval) {
      if (['digit','function','constant','lparen','dot'].includes(act)) {
        expr = ''; pos = 0; jeval = false; frac = false;
      } else if (act === 'operator') {
        if (!expr) { expr = 'Ans'; pos = 3; }
        jeval = false;
      } else { jeval = false; }
    }

    switch (act) {
      case 'digit':    { const r = ins(val, expr, pos); expr = r.expr; pos = r.pos; break; }
      case 'dot':      { const r = ins('.', expr, pos); expr = r.expr; pos = r.pos; break; }
      case 'operator': { const r = ins(val, expr, pos); expr = r.expr; pos = r.pos; break; }
      case 'constant': { const r = ins(val, expr, pos); expr = r.expr; pos = r.pos; break; }
      case 'lparen':   { const r = ins('(', expr, pos); expr = r.expr; pos = r.pos; break; }
      case 'rparen':   { const r = ins(')', expr, pos); expr = r.expr; pos = r.pos; break; }
      case 'function': { const r = ins(val + '(', expr, pos); expr = r.expr; pos = r.pos; break; }
      case 'function2':{ const r = ins(val + '(', expr, pos); expr = r.expr; pos = r.pos; break; }
      case 'nCr':      { const r = ins('nCr(', expr, pos); expr = r.expr; pos = r.pos; break; }
      case 'nPr':      { const r = ins('nPr(', expr, pos); expr = r.expr; pos = r.pos; break; }

      case 'RECIP':    { const r = ins('^(-1)', expr, pos); expr = r.expr; pos = r.pos; break; }
      case 'SQ':       { const w = _wrapPow(expr, pos, 2); expr = w.expr; pos = w.pos; break; }
      case 'CUBE':     { const w = _wrapPow(expr, pos, 3); expr = w.expr; pos = w.pos; break; }
      case 'POW10':    { const r = ins('10^(', expr, pos); expr = r.expr; pos = r.pos; break; }
      case 'YROOT':    { const r = ins('^(1/', expr, pos); expr = r.expr; pos = r.pos; break; }
      case 'SCI_NOT':  { const r = ins('×10^(', expr, pos); expr = r.expr; pos = r.pos; break; }

      case 'NEG': {
        const prev = expr[pos-1];
        const t = (!prev || /[+\-×÷^(,]/.test(prev)) ? '(-' : '×(-1)';
        const r = ins(t, expr, pos); expr = r.expr; pos = r.pos; break;
      }

      case 'TRIG': {
        let fn = val;
        if (hyp) {
          const hm = { sin:'sinh', cos:'cosh', tan:'tanh', asin:'asinh', acos:'acosh', atan:'atanh' };
          fn = hm[fn] || fn; hyp = false;
        }
        const r = ins(fn + '(', expr, pos); expr = r.expr; pos = r.pos; break;
      }

      case 'HYP':    hyp = !hyp; break;

      case 'ANS':    { const r = ins('Ans', expr, pos); expr = r.expr; pos = r.pos; break; }

      case 'cursor_left':  if (pos > 0) pos--; break;
      case 'cursor_right': if (pos < expr.length) pos++; break;

      case 'history_up': {
        const h = s.history;
        if (!h.length) break;
        const ni = Math.min(s.histIdx + 1, h.length - 1);
        setHistIdx(ni); setExpression(h[ni].expr); setResult(h[ni].result);
        setCursorPos(h[ni].expr.length); setJustEval(true); setIsError(false);
        setShiftActive(false); setAlphaActive(false); return;
      }
      case 'history_down': {
        const h = s.history;
        const ni = Math.max(s.histIdx - 1, -1);
        setHistIdx(ni);
        if (ni >= 0) { setExpression(h[ni].expr); setResult(h[ni].result); setCursorPos(h[ni].expr.length); setJustEval(true); }
        setShiftActive(false); setAlphaActive(false); return;
      }

      case 'DEL':
        if (jeval) { _allClear(); return; }
        if (pos > 0) { expr = expr.slice(0, pos-1) + expr.slice(pos); pos--; }
        break;

      case 'AC': _allClear(); return;

      case 'M_PLUS': {
        const v = ansRef.current;
        memRef.current += v;
        setMemActive(memRef.current !== 0); break;
      }
      case 'M_MINUS': {
        const v = ansRef.current;
        memRef.current -= v;
        setMemActive(memRef.current !== 0); break;
      }
      case 'MR': { const r = ins(Engine.formatResult(memRef.current), expr, pos); expr = r.expr; pos = r.pos; break; }
      case 'MC': { memRef.current = 0; setMemActive(false); break; }
      case 'STO': { memRef.current = ansRef.current; setMemActive(true); setResult('STO→M'); setJustEval(true); setShiftActive(false); setAlphaActive(false); return; }

      case 'ENG': {
        const ne = !eng;
        if (s.justEval && !err) {
          setResult(ne ? Engine.toEngineering(ansRef.current) : Engine.formatResult(ansRef.current));
        }
        setEngMode(ne); setShiftActive(false); setAlphaActive(false); return;
      }

      case 'DMS': {
        if (s.result && !err) {
          const { d, m, s: sec } = Engine.toDMS(ansRef.current);
          setResult(`${d}°${m}'${sec}"`); setJustEval(true);
        }
        setShiftActive(false); setAlphaActive(false); return;
      }

      case 'RND': { const r = ins(String(Engine.randomDigit()), expr, pos); expr = r.expr; pos = r.pos; break; }
      case 'RAN': { const r = ins(String(Engine.randomNum()), expr, pos); expr = r.expr; pos = r.pos; break; }

      case 'DRG': {
        const nm = ang === 'DEG' ? 'RAD' : ang === 'RAD' ? 'GRAD' : 'DEG';
        setAngleMode(nm); setShiftActive(false); setAlphaActive(false); return;
      }

      case 'FRAC_INPUT': {
        if (s.justEval && !err) {
          const fStr = Engine.formatFraction(ansRef.current);
          if (frac) { setResult(Engine.formatResult(ansRef.current)); setFracMode(false); }
          else if (fStr.includes('/')) { setResult(fStr); setFracMode(true); }
          setShiftActive(false); setAlphaActive(false); return;
        }
        setFracInput(true); setFracParts(['','','']); setFracStage(1);
        const disp = _fracDisplay(['','',''], 1);
        setExpression(disp); setCursorPos(disp.length);
        setShiftActive(false); setAlphaActive(false); return;
      }

      case 'FRAC_DEC': {
        if (s.justEval && !err) {
          if (frac) { setResult(Engine.formatResult(ansRef.current)); setFracMode(false); }
          else { const fStr = Engine.formatFraction(ansRef.current); if (fStr.includes('/')) { setResult(fStr); setFracMode(true); } }
        }
        setShiftActive(false); setAlphaActive(false); return;
      }

      case 'OPEN_MODE': setShowMode(true); setShiftActive(false); setAlphaActive(false); return;
      case 'MODE_DEG':  setAngleMode('DEG');  setShowMode(false); return;
      case 'MODE_RAD':  setAngleMode('RAD');  setShowMode(false); return;
      case 'MODE_GRAD': setAngleMode('GRAD'); setShowMode(false); return;

      case 'SHIFT':
        setShiftActive(s => !s);
        if (!shiftActive) setAlphaActive(false);
        return;
      case 'ALPHA':
        setAlphaActive(s => !s);
        if (!alphaActive) setShiftActive(false);
        return;

      case 'equals': {
        const r = doEvaluate(expr, ang, eng, frac);
        if (r) {
          setHistory(h => [{ expr, result: r.res }, ...h].slice(0, 30));
          setHistIdx(-1); setResult(r.res); setIsError(r.error); setJustEval(true);
          setExpression(expr); setCursorPos(pos);
        }
        setShiftActive(false); setAlphaActive(false); setHypNext(hyp); return;
      }

      default: break;
    }

    setExpression(expr); setCursorPos(pos); setHypNext(hyp); setJustEval(jeval); setFracMode(frac);
    setShiftActive(false); setAlphaActive(false);
  }, [ins, doEvaluate]);

  function _allClear() {
    setExpression(''); setCursorPos(0); setResult(''); setIsError(false);
    setJustEval(false); setShiftActive(false); setAlphaActive(false);
    setHypNext(false); setFracInput(false); setFracParts(['','','']); setFracStage(1); setFracMode(false);
  }

  function _fracDisplay(fp, stage) {
    const [w, n, d] = fp;
    if (stage === 0) return (w || '') + '▌';
    if (stage === 1) return ((w !== '' && w != null) ? w : '0') + '_' + (n || '') + '▌';
    return ((w !== '' && w != null) ? w : '0') + '_' + ((n !== '' && n != null) ? n : '0') + '/' + (d || '') + '▌';
  }

  function _commitFrac(fp) {
    const [w, n, d] = fp;
    const wStr = (w && w !== '') ? w : '0';
    const nStr = (n && n !== '') ? n : '0';
    const dStr = (d && d !== '') ? d : '1';
    if (dStr === '0') return '0';
    if (wStr === '0') return '(' + nStr + '÷' + dStr + ')';
    return '((' + wStr + '×' + dStr + '+' + nStr + ')÷' + dStr + ')';
  }

  function _wrapPow(expr, pos, exp) {
    let start = pos - 1;
    if (start >= 0 && expr[start] === ')') {
      let depth = 0;
      while (start >= 0) {
        if (expr[start] === ')') depth++;
        else if (expr[start] === '(') { depth--; if (!depth) break; }
        start--;
      }
    } else {
      while (start > 0 && /[0-9.a-zA-Zπ]/.test(expr[start-1])) start--;
    }
    const token = expr.slice(start, pos);
    if (!token) { const r = ins('^' + exp, expr, pos); return r; }
    const ne = expr.slice(0,start) + '(' + token + ')^' + exp + expr.slice(pos);
    return { expr: ne, pos: start + token.length + 4 };
  }

  // Resolve which action fires (with shift/alpha)
  const resolveAction = useCallback((btn) => {
    const s = stateRef.current;
    if (s.shiftActive && btn.sAction) return { action: btn.sAction, value: btn.sValue || '' };
    if (s.alphaActive && btn.aAction) return { action: btn.aAction, value: btn.aValue || '' };
    return { action: btn.action, value: btn.value || '' };
  }, []);

  const onBtn = useCallback((btn) => {
    if (btn.action === 'SHIFT') { handleButton('SHIFT'); return; }
    if (btn.action === 'ALPHA') { handleButton('ALPHA'); return; }
    const { action, value } = resolveAction(btn);
    handleButton(action, value);
  }, [handleButton, resolveAction]);

  // ── Loading / Blocked screens ─────────────────────────────────
  if (appStatus === 'loading') {
    return (
      <View style={S.center}>
        <ActivityIndicator size="large" color="#60b0ff" />
        <Text style={{ color: '#80a0c0', marginTop: 10 }}>Loading...</Text>
      </View>
    );
  }
  if (appStatus === 'blocked') {
    return (
      <View style={S.center}>
        <Text style={S.blockTitle}>Update Required</Text>
        <Text style={S.blockMsg}>{remoteData?.updateMessage || 'Please update to continue'}</Text>
        <TouchableOpacity style={S.blockBtn} onPress={() => remoteData?.updateUrl && Linking.openURL(remoteData.updateUrl)}>
          <Text style={S.blockBtnTxt}>Update Now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── DISPLAY ───────────────────────────────────────────────────
  const exprBefore = expression.slice(0, cursorPos);
  const exprAfter  = expression.slice(cursorPos);
  const modeLabel  = hypNext ? 'HYP' : angleMode;

  return (
    <View style={S.app}>
      <StatusBar barStyle="light-content" backgroundColor="#0a1020" />

      {/* TOP BAR */}
      <View style={S.topBar}>
        <View>
          <Text style={S.brandName}>Calc82</Text>
          <Text style={S.brandModel}>fx-82MS · Webshakk Edition</Text>
        </View>
        <View style={S.indicators}>
          <IndPill label="S"   on={shiftActive}  color="#f0c840" textColor="#2a1800" />
          <IndPill label="A"   on={alphaActive}  color="#8830cc" textColor="#fff" />
          <IndPill label="M"   on={memActive}    color="#aec8a0" textColor="#1e2d10" />
          <IndPill label="ENG" on={engMode}      color="#205060" textColor="#fff" />
          <IndPill label={modeLabel} on={true}   color="#aec8a0" textColor="#1e2d10" always />
        </View>
        <View style={S.topActions}>
          <TouchableOpacity style={S.iconBtn} onPress={() => setShowMode(true)}>
            <Text style={S.iconBtnTxt}>⊙</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.iconBtn} onPress={() => setShowAbout(true)}>
            <Text style={S.iconBtnTxt}>ⓘ</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* DISPLAY */}
      <View style={S.displayPanel}>
        <View style={S.display}>
          {/* Scan lines overlay */}
          <View style={S.scanLines} pointerEvents="none" />
          <View style={S.exprRow}>
            <Text style={S.exprText} numberOfLines={1}>{exprBefore}
              <Text style={[S.cursor, blinkOn ? S.cursorOn : S.cursorOff]}>│</Text>
              {exprAfter}
            </Text>
          </View>
          <Text style={[S.resultText, isError && S.resultError, fracMode && S.resultFrac]} numberOfLines={1} adjustsFontSizeToFit>
            {result}
          </Text>
        </View>
      </View>

      {/* KEYPAD */}
      <View style={S.keypad}>
        {/* ROW 1: SHIFT ALPHA DPAD MODE CLR */}
        <View style={S.keyRow}>
          <CalcBtn label="SHIFT" variant="shift" active={shiftActive} onPress={() => handleButton('SHIFT')} flex={1.1} />
          <CalcBtn label="ALPHA" variant="alpha" active={alphaActive} onPress={() => handleButton('ALPHA')} flex={1.1} />
          {/* D-PAD */}
          <View style={{ flex: 2.2, gap: 2 }}>
            <CalcBtn label="▲" variant="nav" onPress={() => handleButton('history_up')} style={{ flex: 1, minHeight: 0 }} />
            <View style={{ flexDirection: 'row', flex: 1.5, gap: 2 }}>
              <CalcBtn label="◀" variant="nav" onPress={() => handleButton('cursor_left')} flex={1} />
              <View style={S.dpadCenter} />
              <CalcBtn label="▶" variant="nav" onPress={() => handleButton('cursor_right')} flex={1} />
            </View>
            <CalcBtn label="▼" variant="nav" onPress={() => handleButton('history_down')} style={{ flex: 1, minHeight: 0 }} />
          </View>
          <BtnWithLabels btn={{ shift:'SETUP', main:'MODE', action:'OPEN_MODE', sAction:'OPEN_MODE' }} onBtn={onBtn} shift={shiftActive} flex={1} />
          <BtnWithLabels btn={{ shift:'AC', main:'CLR', action:'DEL', sAction:'AC' }} onBtn={onBtn} shift={shiftActive} flex={1} />
        </View>

        {/* ROWS 2–9 */}
        {ROWS.slice(1).map((row, ri) => (
          <View key={ri} style={S.keyRow}>
            {row.map((btn, bi) => (
              <BtnWithLabels key={bi} btn={btn} onBtn={onBtn} shift={shiftActive} alpha={alphaActive} />
            ))}
          </View>
        ))}
      </View>

      {/* MODE MODAL */}
      <Modal visible={showMode} transparent animationType="fade" onRequestClose={() => setShowMode(false)}>
        <TouchableOpacity style={S.modalOverlay} activeOpacity={1} onPress={() => setShowMode(false)}>
          <View style={S.modalBox}>
            <Text style={S.modalTitle}>ANGLE MODE</Text>
            {[['DEG','°','0 – 360° (default)'],['RAD','π','0 – 2π'],['GRAD','ᵍ','0 – 400']].map(([m, icon, desc]) => (
              <TouchableOpacity key={m} style={[S.modeOpt, angleMode === m && S.modeOptActive]} onPress={() => { setAngleMode(m); setShowMode(false); }}>
                <Text style={S.modeIcon}>{icon}</Text>
                <View>
                  <Text style={S.modeLbl}>{m}</Text>
                  <Text style={S.modeDesc}>{desc}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ABOUT MODAL */}
      <Modal visible={showAbout} transparent animationType="fade" onRequestClose={() => setShowAbout(false)}>
        <TouchableOpacity style={S.modalOverlay} activeOpacity={1} onPress={() => setShowAbout(false)}>
          <View style={S.modalBox}>
            <Text style={S.aboutLogo}>Calc82</Text>
            <Text style={S.aboutSub}>fx-82MS · Webshakk Edition</Text>
            <Text style={S.aboutDesc}>
              A pixel-faithful scientific calculator inspired by the Casio fx-82MS 2nd Edition.
              Custom Shunting-Yard expression parser, full scientific engine — zero dependencies.
            </Text>
            <View style={S.aboutRow}>
              <Text style={S.aboutCreator}>Created by <Text style={{ color: '#90f0c0' }}>webshak</Text></Text>
              <TouchableOpacity onPress={() => Linking.openURL('https://webshakk.vercel.app/')}>
                <Text style={S.aboutLink}>Visit →</Text>
              </TouchableOpacity>
            </View>
            <Text style={S.aboutCopy}>© 2026 webshakk. All rights reserved.</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* DAILY MESSAGE CARD */}
      {remoteData?.dailyMessage && !hideMsg && (
        <View style={S.card}>
          <View style={S.cardHeader}>
            <Text style={S.cardTitle}>📢 Notice</Text>
            <TouchableOpacity onPress={() => setHideMsg(true)}><Text style={S.cardClose}>✕</Text></TouchableOpacity>
          </View>
          <Text style={S.cardText}>{remoteData.dailyMessage}</Text>
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════
function IndPill({ label, on, color, textColor, always }) {
  if (!on && !always) return <View style={S.indOff}><Text style={S.indOffTxt}>{label}</Text></View>;
  return (
    <View style={[S.ind, { backgroundColor: on ? color : 'transparent', borderColor: on ? color : 'rgba(255,255,255,0.06)' }]}>
      <Text style={[S.indTxt, { color: on ? textColor : 'transparent' }]}>{label}</Text>
    </View>
  );
}

function CalcBtn({ label, variant, active, onPress, flex, style }) {
  const bg = variantBg(variant, active);
  return (
    <TouchableOpacity activeOpacity={0.65} onPress={onPress}
      style={[S.btn, bg, flex ? { flex } : {}, style || {}]}>
      <Text style={[S.btnMain, variantTxt(variant)]}>{label}</Text>
    </TouchableOpacity>
  );
}

function BtnWithLabels({ btn, onBtn, shift, alpha, flex }) {
  const isEq  = btn.variant === 'eq';
  const isNum = btn.variant === 'num';
  const isOp  = btn.variant === 'op';
  const isDel = btn.variant === 'del';
  const isAc  = btn.variant === 'ac';
  const isBlue = btn.variant === 'blue';

  const bg = (() => {
    if (isEq)   return S.btnEq;
    if (isNum)  return S.btnNum;
    if (isOp)   return S.btnOp;
    if (isDel)  return S.btnDel;
    if (isAc)   return S.btnAc;
    if (isBlue) return S.btnBlue;
    return S.btnDark;
  })();

  const mainTxtStyle = (() => {
    if (isEq)  return S.btnMainEq;
    if (isNum) return S.btnMainNum;
    if (isOp)  return S.btnMainOp;
    if (isDel) return S.btnMainDel;
    if (isAc)  return S.btnMainAc;
    return S.btnMain;
  })();

  return (
    <TouchableOpacity activeOpacity={0.65} onPress={() => onBtn(btn)}
      style={[S.btn, bg, flex ? { flex } : {}]}>
      {btn.shift ? <Text style={S.shiftLbl}>{btn.shift}</Text> : <Text style={S.shiftLbl}> </Text>}
      {btn.alphaTop ? <Text style={S.alphaTopLbl}>{btn.alphaTop}</Text> : null}
      <Text style={mainTxtStyle}>{btn.main}</Text>
    </TouchableOpacity>
  );
}

function variantBg(variant, active) {
  if (variant === 'shift') return active ? S.btnShiftActive : S.btnShift;
  if (variant === 'alpha') return active ? S.btnAlphaActive : S.btnAlpha;
  if (variant === 'nav')   return S.btnNav;
  return S.btnDark;
}
function variantTxt(variant) {
  if (variant === 'shift') return S.btnMainShift;
  if (variant === 'alpha') return S.btnMainAlpha;
  if (variant === 'nav')   return S.btnMainNav;
  return S.btnMain;
}

// ═══════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════
const { width: SW } = Dimensions.get('window');

const S = StyleSheet.create({
  app:          { flex: 1, backgroundColor: '#151b27', paddingTop: Platform.OS === 'android' ? 0 : 44 },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0d1117' },

  // Top bar
  topBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#0a1020', borderBottomWidth: 1, borderBottomColor: 'rgba(60,100,160,0.2)' },
  brandName:    { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 13, letterSpacing: 2, color: '#c0cce0' },
  brandModel:   { fontSize: 9, letterSpacing: 1, color: '#5080b0', marginTop: 2 },
  indicators:   { flexDirection: 'row', gap: 4, flex: 1, justifyContent: 'center', flexWrap: 'wrap' },
  ind:          { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, borderWidth: 1 },
  indOff:       { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  indTxt:       { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 9 },
  indOffTxt:    { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 9, color: 'transparent' },
  topActions:   { flexDirection: 'row', gap: 6 },
  iconBtn:      { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  iconBtnTxt:   { color: '#80a0c0', fontSize: 13 },

  // Display
  displayPanel: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#0e1520' },
  display:      { backgroundColor: '#aec8a0', borderWidth: 2, borderColor: '#6a9060', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, minHeight: 78, justifyContent: 'space-between', overflow: 'hidden' },
  scanLines:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent', opacity: 0.03 },
  exprRow:      { minHeight: 20 },
  exprText:     { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 13, color: '#1e2d10', letterSpacing: 0.3 },
  cursor:       { fontSize: 13 },
  cursorOn:     { color: '#1e2d10' },
  cursorOff:    { color: 'transparent' },
  resultText:   { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 28, color: '#1e2d10', textAlign: 'right', minHeight: 36, letterSpacing: 0.5 },
  resultError:  { fontSize: 16, color: '#803020' },
  resultFrac:   { fontSize: 20 },

  // Keypad
  keypad:       { flex: 1, gap: 3, paddingHorizontal: 5, paddingVertical: 4, backgroundColor: '#101520', borderTopWidth: 1, borderTopColor: 'rgba(40,70,120,0.3)' },
  keyRow:       { flex: 1, flexDirection: 'row', gap: 3, alignItems: 'stretch' },
  dpadCenter:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 4, borderWidth: 1, borderColor: 'rgba(60,100,160,0.2)' },

  // Button bases
  btn:          { flex: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 1, overflow: 'hidden' },
  btnDark:      { backgroundColor: '#1c2438' },
  btnNum:       { backgroundColor: '#252e42' },
  btnOp:        { backgroundColor: '#1e2a3a' },
  btnShift:     { backgroundColor: '#c8941a' },
  btnShiftActive:{ backgroundColor: '#e0b020', borderWidth: 2, borderColor: 'rgba(255,220,60,0.7)' },
  btnAlpha:     { backgroundColor: '#3a6a9a' },
  btnAlphaActive:{ backgroundColor: '#4a7aaa', borderWidth: 2, borderColor: 'rgba(100,160,255,0.7)' },
  btnDel:       { backgroundColor: '#203870' },
  btnAc:        { backgroundColor: '#902020' },
  btnBlue:      { backgroundColor: '#205898' },
  btnEq:        { backgroundColor: '#e03030' },
  btnNav:       { backgroundColor: '#1a2030' },

  // Button text
  btnMain:      { fontSize: 11, fontWeight: '600', color: '#d8e0f0', textAlign: 'center' },
  btnMainNum:   { fontSize: 14, fontWeight: '700', color: '#f0f4ff', textAlign: 'center' },
  btnMainOp:    { fontSize: 15, fontWeight: '700', color: '#80c8ff', textAlign: 'center' },
  btnMainEq:    { fontSize: 20, fontWeight: '700', color: '#fff', textAlign: 'center' },
  btnMainDel:   { fontSize: 11, fontWeight: '600', color: '#80aaff', textAlign: 'center' },
  btnMainAc:    { fontSize: 11, fontWeight: '700', color: '#ffcccc', textAlign: 'center' },
  btnMainShift: { fontSize: 10, fontWeight: '700', color: '#1a0e00', textAlign: 'center' },
  btnMainAlpha: { fontSize: 10, fontWeight: '700', color: '#fff', textAlign: 'center' },
  btnMainNav:   { fontSize: 9,  color: '#90a8c8', textAlign: 'center' },
  shiftLbl:     { fontSize: 7, fontWeight: '600', color: '#f0c840', lineHeight: 10, textAlign: 'center' },
  alphaTopLbl:  { fontSize: 7, fontWeight: '600', color: '#cc55ff', lineHeight: 10, textAlign: 'center' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center' },
  modalBox:     { backgroundColor: '#1a2238', borderWidth: 1, borderColor: 'rgba(80,120,200,0.2)', borderRadius: 16, padding: 22, width: '88%', maxWidth: 320 },
  modalTitle:   { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 12, letterSpacing: 2, color: '#e0c860', marginBottom: 14, textAlign: 'center' },
  modeOpt:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 11, marginBottom: 8 },
  modeOptActive:{ borderColor: 'rgba(100,160,255,0.4)', backgroundColor: 'rgba(100,160,255,0.07)' },
  modeIcon:     { fontSize: 20, width: 28, textAlign: 'center', color: '#fff' },
  modeLbl:      { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 11, letterSpacing: 1, color: '#b0c8e0' },
  modeDesc:     { fontSize: 10, color: '#506070', marginTop: 2 },

  // About
  aboutLogo:    { fontSize: 26, fontWeight: '700', color: '#60b0ff', textAlign: 'center', letterSpacing: 2 },
  aboutSub:     { fontSize: 9, letterSpacing: 2, color: '#5080a0', textAlign: 'center', marginTop: 3, marginBottom: 14 },
  aboutDesc:    { fontSize: 11.5, color: '#8090a8', lineHeight: 19, textAlign: 'center', marginBottom: 14 },
  aboutRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 12 },
  aboutCreator: { fontSize: 12, color: '#60d0a0' },
  aboutLink:    { fontSize: 11, color: '#f0c840', borderWidth: 1, borderColor: 'rgba(240,200,64,0.3)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  aboutCopy:    { marginTop: 12, fontSize: 10, opacity: 0.6, color: '#aaa', textAlign: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 10 },

  // Message card
  card:         { position: 'absolute', top: 10, left: 10, right: 10, backgroundColor: '#fff', padding: 15, borderRadius: 12, elevation: 5, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10 },
  cardHeader:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle:    { fontSize: 15, fontWeight: 'bold' },
  cardText:     { fontSize: 14, color: '#333' },
  cardClose:    { fontSize: 18, color: '#666' },

  // Blocked
  blockTitle:   { fontSize: 22, fontWeight: 'bold', marginBottom: 10, color: '#fff' },
  blockMsg:     { textAlign: 'center', marginBottom: 20, color: '#aaa' },
  blockBtn:     { backgroundColor: '#1a6aff', padding: 12, borderRadius: 8 },
  blockBtnTxt:  { color: 'white', fontWeight: 'bold' },
});