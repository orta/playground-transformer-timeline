// @ts-check

// const tsvfs = require("@typescript/vfs/dist/vfs.esm")
import * as tsvfs from "../node_modules/@typescript/vfs/dist/vfs.cjs.development"

self.onmessage = async function (msg) {
  switch(msg.data.action) {
    case "start": {
      // Import the vscode loader into the runtime, but we don't actually use it
      this.importScripts(msg.data.loaderSrc)

      // Next grab TS
      // looks like "https://typescript.azureedge.net/cdn/3.9.2/monaco/dev/vs/language/typescript/lib/typescriptServices.js"
      const tsBase = msg.data.requireConfig.paths.vs 
      const tsURL = `${tsBase}/language/typescript/lib/typescriptServices.js`
      importScripts(tsURL)
      
      // @ts-ignore
      self.postMessage({ action: "ready" })
    }
    case "transform": {
      // @ts-expect-error
      const ts: typeof import("typescript") = self.ts

      /** @type { import("typescript").CompilerOptions } */
      const compilerOptions = msg.data.options

      /** @type { string } */
      const filepath = msg.data.filepath

      const fsMap = await tsvfs.createDefaultMapFromCDN(compilerOptions, ts.version, true, ts)
      fsMap.set(filepath, msg.data.text)
  
      const system = tsvfs.createSystem(fsMap)
      const host = tsvfs.createVirtualCompilerHost(system, compilerOptions, ts)
  
      const program = ts.createProgram({
        rootNames: [...fsMap.keys()],
        options: compilerOptions,
        host: host.compilerHost,
      })
      

      // @ts-expect-error - private API
      let checker = program.getDiagnosticsProducingTypeChecker();
      let sourceFile = program.getSourceFile(filepath);

      const emitResolver = checker.getEmitResolver(sourceFile, neverCancel);

      // This gets filled out as the emitter runs below
      const dtsOutputs = [];
      const jsOutputs = [];

      const jsNames = getScriptTransformerNamess(compilerOptions, ts)
      const dtsNames = ["DTS"];

      // @ts-expect-error Private API
      const allTransformers = ts.getTransformers(options, [], false);
      console.log(allTransformers.scriptTransformers)
      
      // Loop through the script transformers going from [1], [1, 2], [1, 2, 3] ... 
      allTransformers.scriptTransformers.forEach((_t, index) => {
        const transformersToThis = [...allTransformers.scriptTransformers].splice(0, index + 1);

        const writeFile = (name, text) => {
          if(name.endsWith(".js")) {
            jsOutputs.push({
              filename: name,
              index,
              text,
            });
          }
        }

        const emitHost = createEmitHost(compilerOptions, sourceFile, ts, writeFile);
        const incrementalTransformers = {
          scriptTransformers: transformersToThis,
          declarationTransformers: allTransformers.declarationTransformers
        }

        // @ts-expect-error Private API
        ts.emitFiles(
          emitResolver,
          emitHost,
          undefined, // target source file (doesn't seem to work when I set it)
          incrementalTransformers, // an incremental subset of allTransformers
          false, // only DTS
          false, // only build info
          false // force DTS
        );
      });

       
      // Loop through the declaration transformers going from [1], [1, 2], [1, 2, 3] ... 
      allTransformers.declarationTransformers.forEach((_t, index) => {
        const transformersToThis = [...allTransformers.declarationTransformers].splice(0, index + 1);

        const writeFile = (name, text) => {
          if(name.endsWith(".d.ts")) {
            dtsOutputs.push({
              filename: name,
              index,
              text,
            });
          }
        }

        const emitHost = createEmitHost(compilerOptions, sourceFile, ts, writeFile);
        const incrementalTransformers = {
          scriptTransformers: allTransformers.scriptTransformers,
          declarationTransformers: transformersToThis
        }

        // @ts-expect-error Private API
        ts.emitFiles(
          emitResolver,
          emitHost,
          undefined, // target source file (doesn't seem to work when I set it)
          incrementalTransformers, // an incremental subset of allTransformers
          false, // only DTS
          false, // only build info
          false // force DTS
        );
      });

      // @ts-ignore
      self.postMessage({ action: "results", jsNames,  dtsNames, jsOutputs, dtsOutputs })
    }
  }
}


// Some filler stuff we need to get stuff working with the private APIs

const createEmitHost = (
  options,
  sourceFile,
  ts,
  writeFile
) => {
  const emitHost = {
    getPrependNodes: () => [],
    getCanonicalFileName: (i) => i,
    getCommonSourceDirectory: () => ".",
    getCompilerOptions: () => options,
    getCurrentDirectory: () => "",
    getNewLine: () => "\n",
    getSourceFile: () => sourceFile,
    getSourceFileByPath: () => sourceFile,
    getSourceFiles: () => [sourceFile],
    getLibFileFromReference: () => {
      throw new Error("not implemented");
    },
    isSourceFileFromExternalLibrary: () => false,
    getResolvedProjectReferenceToRedirect: () => undefined,
    getProjectReferenceRedirect: () => undefined,
    isSourceOfProjectReferenceRedirect: () => false,
    writeFile: writeFile,
    isEmitBlocked: () => false,
    readFile: (f) =>  sourceFile.text,
    fileExists: (f) =>  true,
    useCaseSensitiveFileNames: () => true,
    getProgramBuildInfo: () => undefined,
    getSourceFileFromReference: () => undefined,
    // @ts-ignore private API, might not even be used
    redirectTargetsMap: ts.createMultiMap(),
  };
  return emitHost;
};

const neverCancel = {
  isCancellationRequested() {
    return false;
  },
  throwIfCancellationRequested() {},
};

// Direct rip of https://github.com/microsoft/TypeScript/blob/fb4d53079b050abf6bfb4582ee0624ec484f7876/src/compiler/transformer.ts#L37
// Switching the transformers with strings for the names
function getScriptTransformerNamess(compilerOptions, ts) {
  const jsx = compilerOptions.jsx;

  const languageVersion = ts.getEmitScriptTarget(compilerOptions);
  const moduleKind = ts.getEmitModuleKind(compilerOptions);
  const transformers = [];
  
  transformers.push("TS");
  transformers.push("Class Fields");

  if (jsx === ts.JsxEmit.React) {
      transformers.push("JSX");
  }

  if (languageVersion < ts.ScriptTarget.ESNext) {
      transformers.push("ESNext");
  }

  if (languageVersion < ts.ScriptTarget.ES2020) {
      transformers.push("ES2020");
  }

  if (languageVersion < ts.ScriptTarget.ES2019) {
      transformers.push("ES2019");
  }

  if (languageVersion < ts.ScriptTarget.ES2018) {
      transformers.push("ES2018");
  }

  if (languageVersion < ts.ScriptTarget.ES2017) {
      transformers.push("ES2017");
  }

  if (languageVersion < ts.ScriptTarget.ES2016) {
      transformers.push("ES2016");
  }

  if (languageVersion < ts.ScriptTarget.ES2015) {
      transformers.push("ES2015");
      transformers.push("Generators");
  }

  transformers.push(getModuleTransformer(moduleKind, ts));

  // The ES5 transformer is last so that it can substitute expressions like `exports.default`
  // for ES3.
  if (languageVersion < ts.ScriptTarget.ES5) {
      transformers.push("ES5");
  }

  return transformers;
}

function getModuleTransformer(moduleKind, ts) {
  switch (moduleKind) {
      case ts.ModuleKind.ESNext:
      case ts.ModuleKind.ES2020:
      case ts.ModuleKind.ES2015:
          return "ES Module";
      case ts.ModuleKind.System:
          return "System";
      default:
          return "CommonJs/AMD/UMD";
  }
}
