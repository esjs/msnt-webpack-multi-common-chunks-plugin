const path = require('path');

const ExtractTextPluginCls = require('extract-text-webpack-plugin');
const ExtractTextPlugin = new ExtractTextPluginCls('fakename');
const ExtractedModule = require("extract-text-webpack-plugin/dist/lib/ExtractedModule");

const SortableSet = require("webpack/lib/util/SortableSet");

const MultiCommonChunksBase = require('./index');

class MultiCommonChunksCSS extends MultiCommonChunksBase {
  apply(compiler) {
    var entryChunks,
        commonChunks;

    const extension = this.extension = 'css';

    // HACK!!!
    // required for postcss-reexport plugin to work properly with Webpack
    // remember chaged file, we will need it later to fix issue with
    // files created during build operation in postcss-temp
    // the problem is that modified time on those file is simetimes lower 
    // than module build time, and this prevents module rebuild
    var fileChanged;
    compiler.plugin('invalid', (filename, changeTime) => {  
      if (filename.includes('postcss-temp')) {
        fileChanged = filename;
      }
    });

    compiler.plugin('this-compilation', (compilation) => {  
      if (fileChanged) {
        // HACK!!!
        // required for postcss-reexport plugin to work properly with Webpack
        // by changing modified time of changed file, we can be sure that module
        // will be rebuild
        compilation.fileTimestamps[fileChanged] = compilation.fileTimestamps[fileChanged] * 1000;
        fileChanged = null;
      }
      
      compilation.plugin(['optimize-extracted-chunks'], (extractedChunks) => {
        const extractableModules = this.getExtractableModules(this.minChunks, extractedChunks);

        this.updateAvailableModulesUsage(extractableModules, extractedChunks);

        const commonChunksCount = this.assignCommonIndexes(extractableModules);

        this.addImportsForExtractedModules(extractedChunks);

        commonChunks = this.addExtractedModulesToCommonChunks(compilation, extractedChunks, extractableModules, commonChunksCount);

        entryChunks = extractedChunks.filter(chunk => {
          // prevent sorting on extracted chunk modules
          chunk.sortModules = function() {}
          return !chunk.name.includes(this.commonChunkPrefix);
        });
      });

      compilation.plugin("additional-assets", callback => {
        commonChunks.forEach((commonChunk, commonChunkIndex) => {
          var targetEntryChunk;
          
          entryChunks.forEach(entryChunk => {
            if (targetEntryChunk) return;
            if (
              entryChunk.multiCommonChunksRequired && entryChunk.multiCommonChunksRequired.includes(commonChunkIndex)
            ) {
              targetEntryChunk = entryChunk.originalChunk;
            }
          });


          const source = ExtractTextPlugin.renderExtractedChunk(commonChunk);
          const outputFileName = this.getPath(source.source(), {index: commonChunkIndex});

          compilation.assets[outputFileName] = source;
          targetEntryChunk.files.push(outputFileName);
        });

        callback();

        if (this.processOutput && typeof this.processOutput === 'function') {
          this.processOutput(entryChunks, commonChunks);
        }
      });
    });
  }

  addImportsForExtractedModules(extractedChunks) {
    extractedChunks.forEach(extractedChunk => {
      if (!extractedChunk.multiCommonChunksExtractModules) return;
      var newExtractedChunkModules = new SortableSet();

      for (let index in extractedChunk.multiCommonChunksExtractModules) {
        var extractedModules = extractedChunk.multiCommonChunksExtractModules[index];

        extractedModules.forEach(extractedModule => {
          extractedModule.removeChunk(extractedChunk);
        });

        const extractedModulesSource = extractedModules
          .map(mod => mod.source().source())
          .join('');

        const outputFileName = this.getPath(extractedModulesSource, {index});

        newExtractedChunkModules.add(
          new ExtractedModule.default(
            `multi-common-chunk-import-module-${index}`,
            extractedModules[0],
            `@import "${outputFileName}";\n`,
            null,
            [],
            ""
          )
        );
      }

      extractedChunk.modules.forEach(mod => newExtractedChunkModules.add(mod));

      extractedChunk.modules = newExtractedChunkModules;
    });
  }
}

module.exports = MultiCommonChunksCSS;