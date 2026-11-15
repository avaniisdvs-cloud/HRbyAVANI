const ts = require(process.cwd()+'/node_modules/typescript');
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=process.cwd();
// Follow imported constants and conditional spreads using the TypeScript checker.
// Use React's own shorthand map so the audit matches the installed renderer.
const reactFile=path.join(root,'node_modules/react-dom/cjs/react-dom-client.development.js');
const rf=ts.createSourceFile(reactFile,fs.readFileSync(reactFile,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
let map;
function find(n){if(ts.isVariableDeclaration(n)&&n.name.getText(rf)==='shorthandToLonghand'&&n.initializer&&ts.isObjectLiteralExpression(n.initializer))map=vm.runInNewContext('('+n.initializer.getText(rf)+')');if(ts.isBinaryExpression(n)&&n.left.getText(rf)==='shorthandToLonghand'&&ts.isObjectLiteralExpression(n.right))map=vm.runInNewContext('('+n.right.getText(rf)+')');ts.forEachChild(n,find)}find(rf);
if (!map) throw new Error('React style shorthand map was not found');
const config=ts.readConfigFile('tsconfig.json',ts.sys.readFile);const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);
const program=ts.createProgram(parsed.fileNames,parsed.options),checker=program.getTypeChecker();
function unwrap(n){while(n&&(ts.isParenthesizedExpression(n)||ts.isAsExpression(n)||ts.isSatisfiesExpression(n)||ts.isNonNullExpression(n)))n=n.expression;return n}
function expand(n,seen=new Set()) {n=unwrap(n);if(!n||seen.has(n))return [];seen=new Set(seen).add(n);
 if(ts.isObjectLiteralExpression(n))return n.properties.flatMap(p=>ts.isSpreadAssignment(p)?expand(p.expression,seen):ts.isPropertyAssignment(p)?[{key:ts.isIdentifier(p.name)||ts.isStringLiteral(p.name)?p.name.text:'',node:p}]:[]);
 if(ts.isIdentifier(n)||ts.isPropertyAccessExpression(n)){let sym=checker.getSymbolAtLocation(ts.isIdentifier(n)?n:n.name);if(sym&&(sym.flags&ts.SymbolFlags.Alias))sym=checker.getAliasedSymbol(sym);const decl=sym?.valueDeclaration;return decl?.initializer?expand(decl.initializer,seen):[]}
 if(ts.isConditionalExpression(n))return [...expand(n.whenTrue,seen),...expand(n.whenFalse,seen)];
 if(ts.isBinaryExpression(n)&&[ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken].includes(n.operatorToken.kind))return [...expand(n.left,seen),...expand(n.right,seen)];
 return [];
}
let findings=[],scanned=0,styleCount=0,unresolvedStyles=0;
for(const sf of program.getSourceFiles()){if(!/\/(app|components)\//.test(sf.fileName)||!sf.fileName.endsWith('.tsx')||sf.fileName.includes('node_modules'))continue;scanned++;
 if(sf.parseDiagnostics.length) throw new Error('Invalid syntax in '+path.relative(root,sf.fileName));
 function visit(n){if(ts.isJsxAttribute(n)&&n.name.getText(sf)==='style'&&n.initializer&&ts.isJsxExpression(n.initializer)){
 styleCount++;
 const props=expand(n.initializer.expression),by=new Map();
 if(!props.length) unresolvedStyles++;for(const p of props){if(!by.has(p.key))by.set(p.key,[]);by.get(p.key).push(p)}
 let pairs=[];for(const a of by.keys())if(map[a])for(const b of by.keys())if(a!==b){let x=map[a],y=map[b]||[b];if(x.some(v=>y.includes(v))&&(!map[b]||x.length>y.length))pairs.push([a,b]);}
 if(pairs.length)findings.push({file:path.relative(root,sf.fileName),line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,pairs,properties:Object.fromEntries([...by].map(([k,v])=>[k,v.map(p=>{const s=p.node.getSourceFile();return {file:path.relative(root,s.fileName),line:s.getLineAndCharacterOfPosition(p.node.getStart(s)).line+1,text:p.node.getText(s)}})]))});
 }ts.forEachChild(n,visit)}visit(sf)}
const result={scanned,styleCount,unresolvedStyles,findings};
const report=process.argv.find(arg=>arg.startsWith('--report='))?.slice(9);
if(report){fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify(result,null,2));}
console.log(`Scanned ${scanned} TSX files and ${styleCount} inline styles: ${findings.length} shorthand conflicts. ${unresolvedStyles} externally supplied/dynamic styles require runtime coverage.`);
for(const f of findings)console.error(`${f.file}:${f.line}: ${f.pairs.map(p=>p.join(' / ')).join(', ')}`);
if(findings.length)process.exitCode=1;
