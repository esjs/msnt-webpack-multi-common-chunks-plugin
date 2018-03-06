const Chunk = require('webpack/lib/Chunk');
const CommonsChunkPlugin = require('webpack/lib/optimize/CommonsChunkPlugin');

const loaderUtils = require('loader-utils');

class MultiCommonChunksPlugin extends CommonsChunkPlugin {
  constructor(commonsChunkPluginParams, params) {
    super(commonsChunkPluginParams);

    this.commonChunkPrefix = params.commonChunkName || 'multi_common_chunk_';
    this.outputName = params.outputName || '[name].[ext]';
    this.processOutput = params.processOutput;
  }

  /**
   * We assing multiCommonChunksUsedBy for each module
   * to know how many entry chunks require this module 
   * For exmple
   * ["app_article_browse", "app_driver_browse", "app_team_browse", "app_video_browse"]
   */
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

  getCommonChunkByCommonIndex(commonChunks, index) {
    return commonChunks.filter(chunk => chunk.multiCommonChunkIndex === index)[0];
  }

  mergeSmallCommonChunks(commonChunks, entryChunks) {
    // keep track of chunk ID's that are no longer available
    const removedChunkBlocks = [];

    // list of small chunk id's, that must be merged into entry chunk
    const smallMergedChunks = [];

    // holds refenreces map for merged chunks
    // require to add all required chunks on merge
    const removedChunksMap = {};

    const bigCommonChunks = [];

    // this.minSize
    let smallCommonChunks = commonChunks.filter(chunk => {
      chunk.multiCommonChunkSize = this.getChunkSize(chunk);

      const isSmall = chunk.multiCommonChunkSize < this.minSize;

      if (!isSmall) {
        bigCommonChunks.push(chunk);
      }

      return isSmall;
    });

    function moveSmallCommonChunkIntoEntry(entryChunk, commonChunk) {
      commonChunk.forEachModule(mod => {
        // mod.removeChunk(commonChunk);

        entryChunk.addModule(mod);
        mod.addChunk(entryChunk);
      });
    }

    // we need to loop through all required commonchunks of entry chunk
    // and merge those that are in smallCommmonChunks array
    entryChunks.forEach(entryChunk => {
      // store newly removed chunks, we will need them 
      // to store references to merged chunk
      const newRemovedChunkIds = [];
      
      // excule all removed ID's first
      removedChunkBlocks.forEach(removedBlock => {
        let chunkAddedFlag = false;
        removedBlock.forEach(removedChunkId => {
          if (
            !chunkAddedFlag &&
            removedBlock.includes(removedChunkId)
          ) {
            chunkAddedFlag = true;
            let targetRemovedChunkId = removedChunksMap[removedChunkId];

            // add required target chunk only if entryChunk doesn't have it 
            if (!entryChunk.multiCommonChunksRequired.includes(targetRemovedChunkId)) {
              entryChunk.multiCommonChunksRequired.push(targetRemovedChunkId);
            }
          }

          const index = entryChunk.multiCommonChunksRequired.indexOf(removedChunkId);

          if (index === -1) return;
          
          entryChunk.multiCommonChunksRequired.splice(index, 1);
        })
      });

      // if entryChunk contain small merged chunks we need to merge them
      smallMergedChunks.forEach(smallChunkId => {
        const index = entryChunk.multiCommonChunksRequired.indexOf(smallChunkId);

        if (index === -1) return;

        entryChunk.multiCommonChunksRequired.splice(index, 1);

        moveSmallCommonChunkIntoEntry(
          entryChunk, this.getCommonChunkByCommonIndex(commonChunks, smallChunkId)
        );
      });

      if (!smallCommonChunks.length) return;

      // flag which indicates that we found our first match
      // and we don't need to remove this chunk, just merge all other chunks
      // into this one
      let isFirstMatch = true;

      const chunksToMerge = [];

      // with each iteration merge all small chunks required by entryChunk
      // and add all merged chunk ID's to removedChunkIds array
      // to remove them in on other entry points
      smallCommonChunks = smallCommonChunks.filter(chunk => {
        const index = entryChunk.multiCommonChunksRequired.indexOf(chunk.multiCommonChunkIndex);

        if (index === -1) return true;

        chunksToMerge.push(chunk);

        if (isFirstMatch) {
          isFirstMatch = false;
        } else {
          newRemovedChunkIds.push(chunk.multiCommonChunkIndex);
          entryChunk.multiCommonChunksRequired.splice(index, 1);
        }

        return false;
      });

      // if there are no required small chunks to merge, continue...
      if (!chunksToMerge.length) return;

      const mainChunk = chunksToMerge.shift();

      // unlink modules from old chunk, and link to target merge chunk
      chunksToMerge.forEach(chunk => {
        chunk.forEachModule(mod => {
          mod.removeChunk(chunk);

          mainChunk.addModule(mod);
          mod.addChunk(mainChunk);
        });
      });

      removedChunkBlocks.push(newRemovedChunkIds);

      // store correct chunks mapping, to update indexes in other entryChunks
      newRemovedChunkIds.forEach(id => {
        removedChunksMap[id] = mainChunk.multiCommonChunkIndex;
      });

      // if merged chunk is still not large enough
      if (this.getChunkSize(mainChunk) < this.minSize) {
        smallMergedChunks.push(mainChunk.multiCommonChunkIndex);

        const index = entryChunk.multiCommonChunksRequired.indexOf(mainChunk.multiCommonChunkIndex);

        entryChunk.multiCommonChunksRequired.splice(index, 1);

        moveSmallCommonChunkIntoEntry(entryChunk, mainChunk);
      } else {
        bigCommonChunks.push(mainChunk);
      }
    });

    return bigCommonChunks;
  }

  getChunkSize(chunk) {
    const size = chunk.getModules().reduce((totalSize, module) => {
      const source = this.extension === 'css' ? module.source() : module._source;
      return totalSize +  source.size();
    }, 0);

    return size;
  }

  getPath(source, options) {
    // "/" required for interpolateName to change "name"
    const resourcePath = `/${this.commonChunkPrefix}${options.index}.${this.extension}`;

    return loaderUtils.interpolateName({
      resourcePath
    }, this.outputName, {
      content: source,
    });
  }

  removeExtractedModules(extractedChunks) {
    extractedChunks.forEach(extractedChunk => {
      if (!extractedChunk.multiCommonChunksExtractModules) return;

      for (let index in extractedChunk.multiCommonChunksExtractModules) {
        var extractedModules = extractedChunk.multiCommonChunksExtractModules[index];

        extractedModules.forEach(extractedModule => {
          extractedModule.removeChunk(extractedChunk);
        });
      }
    });
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

  createCommonChunks(extractableModules, commonChunksCount) {
    const commonChunks = [];

    // create chunks for common modules
    for (let i = 0; i < commonChunksCount; i++) {
      let newChunkName = `${this.commonChunkPrefix}${i}`,
          newChunk;

      newChunk = new Chunk(newChunkName);

      newChunk.multiCommonChunkIndex = i;

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
}

module.exports = MultiCommonChunksPlugin;