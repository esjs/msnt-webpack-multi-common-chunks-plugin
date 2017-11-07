const MultiCommonChunksBase = require('./index');

class MultiCommonChunksJS extends MultiCommonChunksBase {
  apply(compiler) {
    compiler.plugin('this-compilation', (compilation) => {

      compilation.plugin(['optimize-chunks'], (chunks) => {
        // only optimize once
        if(compilation[this.ident]) return;
        compilation[this.ident] = true;

        const affectedChunks = this.getAffectedChunks(
          compilation,
          chunks,
          {parents: []}, // fake target chunk to 
          [], // fake targetChunks
          0, // index of current targetChunk
          null, // selectedChunks
          false, // async
          this.children
        );

        const extractableModules = this.getExtractableModules(this.minChunks, affectedChunks);

        this.updateAvailableModulesUsage(extractableModules, affectedChunks);

        let commonChunksCount = this.assignCommonIndexes(extractableModules);

        this.removeExtractedModules(affectedChunks);

        var commonChunks = this.addExtractedModulesToCommonChunks(compilation, affectedChunks, extractableModules, commonChunksCount, true);

        
        var entryChunks = affectedChunks.filter(chunk => {
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