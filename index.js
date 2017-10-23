const Chunk = require('webpack/lib/Chunk');
const CommonsChunkPlugin = require('webpack/lib/optimize/CommonsChunkPlugin');

class MultiCommonChunksPlugin extends CommonsChunkPlugin {
  constructor(commonsChunkPluginParams, params) {
    super(commonsChunkPluginParams);

    this.commonChunkPrefix = params.commonChunkName || 'multi_common_chunk_';
    this.processOutput = params.processOutput;
  }

  updateAvailableModulesUsage(extractableModules, chunks) {
    for (const modIndex in extractableModules) {
      let extractableModule = extractableModules[modIndex];
      extractableModule.multiCommonChunksUsedBy = [];

      chunks.forEach(chunk => {
        if (chunk.modulesIterable.has(extractableModule)) {
          extractableModule.multiCommonChunksUsedBy.push(chunk.name);
        }
      })
    }
  }

  assignCommonIndexes(extractableModules) {
    var index = -1,
        commonModulesIndex = {};

    extractableModules.forEach(mod => {
      let modKey = mod.multiCommonChunksUsedBy.join('_'),
          // ExtractedModules don't have forEachChunk iterator
          moduleChunksIterator = mod.forEachChunk ? mod.forEachChunk.bind(mod) : mod.chunks.forEach.bind(mod.chunks);

      if (mod.multiCommonChunksUsedBy.length === 1) return;
      
      if (!commonModulesIndex.hasOwnProperty(modKey)) {
        mod.multiCommonChunkId = ++index;
        commonModulesIndex[modKey] = index;
      } else {
        mod.multiCommonChunkId = commonModulesIndex[modKey];
      }

      // add list of required commonChunks to entryChunks
      moduleChunksIterator(function(chunk) {
        if (!chunk.multiCommonChunksRequired) {
          chunk.multiCommonChunksRequired = [];
        }
        if (!chunk.multiCommonChunksRequired.includes(index)) {
          chunk.multiCommonChunksRequired.push(index);
        }

        // store 
        if (!chunk.multiCommonChunksExtractModules) {
          chunk.multiCommonChunksExtractModules = {};
        }
        if (!chunk.multiCommonChunksExtractModules[index]) {
          chunk.multiCommonChunksExtractModules[index] = [];
        }
        chunk.multiCommonChunksExtractModules[index].push(mod);
      });
    });

    // return common chunks count
    return index + 1;
  }

  addExtractedModulesToCommonChunks(compilation, chunks, extractableModules, commonChunksCount, addToCompilation) {
    var commonChunks = [];
    
    // create chunks for common modules
    for (let i = 0; i < commonChunksCount; i++) {
      let newChunkName = `${this.commonChunkPrefix}${i}`,
          newChunk;

      if (addToCompilation) {
        newChunk = compilation.addChunk(newChunkName);
      } else {
        newChunk = new Chunk(newChunkName);
      }

      commonChunks.push(newChunk);
    }

    extractableModules.forEach(module => {
      let chunk = commonChunks[module.multiCommonChunkId];

      // if module don't belogn to any common chunk, skip it
      if (!chunk) return;

      chunk.addModule(module);
      module.addChunk(chunk);
    });

    return commonChunks;
  }

  makeCommonChunksTargetsOfEntryChunks(chunks, commonChunks) {
    chunks.forEach(chunk => {
      chunk.multiCommonChunksRequired.forEach(requiredCommmonChunkIndex => {
        var commonChunk = commonChunks[requiredCommmonChunkIndex];

        // set commonChunk as new sole parent
        chunk.parents = [commonChunk];
        
        // add chunk to commonChunk
        commonChunk.addChunk(chunk);

        for(const entrypoint of chunk.entrypoints) {
          entrypoint.insertChunk(commonChunk, chunk);
        }
      });
    });
  }
}

module.exports = MultiCommonChunksPlugin;