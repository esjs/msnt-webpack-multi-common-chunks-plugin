const MultiCommonChunksBase = require('./index');

class MultiCommonChunksJS extends MultiCommonChunksBase {
  apply(compiler) {
    compiler.plugin('this-compilation', (compilation) => {

      compilation.plugin(['optimize-chunks'], (chunks) => {
        // only optimize once
        if(compilation[this.ident]) return;
        compilation[this.ident] = true;

        const extractableModules = this.getExtractableModules(this.minChunks, chunks);

        this.updateAvailableModulesUsage(extractableModules, chunks);

        let commonChunksCount = this.assignCommonIndexes(extractableModules);

        this.removeExtractedModules(chunks);

        var commonChunks = this.addExtractedModulesToCommonChunks(compilation, chunks, extractableModules, commonChunksCount, true);

        var entryChunks = chunks.filter(chunk => {
          return !chunk.name.includes(this.commonChunkPrefix);
        });

        // connect used chunks with commonChunks
        this.makeCommonChunksTargetsOfEntryChunks(entryChunks, commonChunks);

        if (this.processOutput && typeof this.processOutput === 'function') {
          this.processOutput(entryChunks, commonChunks);
        }
      });
    });
  }

  removeExtractedModules(chunks) {
    chunks.forEach(extractedChunk => {
      if (!extractedChunk.multiCommonChunksExtractModules) return;

      for (let index in extractedChunk.multiCommonChunksExtractModules) {
        var extractedModules = extractedChunk.multiCommonChunksExtractModules[index];

        extractedModules.forEach(extractedModule => {
          extractedModule.removeChunk(extractedChunk);
        });
      }
    });
  }
}

module.exports = MultiCommonChunksJS;