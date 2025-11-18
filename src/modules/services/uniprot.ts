import { TranslateTask } from "../../utils/task";
import { TranslateService } from "./base";
import { config } from "../../../package.json";

// 延迟获取插件实例和工具包
function getAddon() {
  // @ts-ignore - Plugin instance is not typed
  return Zotero[config.addonInstance];
}

function getZtoolkit() {
  return getAddon().data.ztoolkit;
}

interface UniProtSearchResult {
  id: string;
  proteinName: string;
  description: string;
  organism: string;
  url: string;
}

async function searchUniProt(data: Required<TranslateTask>) {
  const query = data.raw.trim();
  
  if (!query) {
    throw new Error("Please enter a search term");
  }

  // 构建查询参数，参考Chrome插件的语法
  let searchQuery = `gene_exact:${encodeURIComponent(query)} AND reviewed:true`;
  
  // 如果有物种编号，添加到查询中
  if (data.taxonomyId && data.taxonomyId.trim() !== "") {
    searchQuery += ` AND (taxonomy_id:${data.taxonomyId})`;
  }

  // 使用URLSearchParams构建URL，避免编码问题
  const searchParams = new URLSearchParams({
    query: searchQuery,
    fields: [
      "accession",
      "protein_name", 
      "cc_function",
      "organism_name",
      "xref_biogrid",
      "xref_flybase", 
      "cc_subcellular_location",
      "xref_refseq",
      "xref_string"
    ].join(","),
    sort: "accession desc",
    includeIsoform: "false",
    format: "json",
    size: "10"
  });
  
  const searchUrl = `https://rest.uniprot.org/uniprotkb/search?${searchParams}`;

  try {
    const xhr = await Zotero.HTTP.request(
      "GET",
      searchUrl,
      {
        headers: {
          'Accept': 'application/json'
        },
        timeout: 15000,
        responseType: "json"
      }
    );

    if (xhr?.status !== 200) {
      throw `Request error: ${xhr?.status}`;
    }

    // 使用HTML格式化结果，参考Chrome插件的格式
    data.result = formatResultsAsHTML(xhr.response.results || [], query);
  } catch (error) {
    getZtoolkit().log("UniProt search error:", error);
    throw error;
  }
}

function parseUniProtResults(data: any): UniProtSearchResult[] {
  if (!data.results || !Array.isArray(data.results)) {
    return [];
  }

  return data.results.map((item: any) => {
    const proteinName = extractProteinName(item);
    const description = extractDescription(item);
    const organism = extractOrganism(item);
    
    return {
      id: item.primaryAccession || '',
      proteinName,
      description,
      organism,
      url: `https://www.uniprot.org/uniprot/${item.primaryAccession || ''}`
    };
  });
}

// 参考Chrome插件的HTML格式化方式
function formatResultsAsHTML(results: any[], query: string): string {
  if (results.length === 0) {
    return `<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin-bottom: 15px; background: linear-gradient(135deg, #ffe6e6 0%, #ffcccc 100%); padding: 10px; border-radius: 10px; border: 1px solid #ffb3b3; box-shadow: 0 2px 4px rgba(0,0,0,0.05); max-width: 100%; overflow: hidden; box-sizing: border-box;">
      <p style="color: red; font-weight: bold;">No UniProt results found for: ${query}</p>
    </div>`;
  }

  // 单个结果使用详细格式，参考Chrome插件的single-result-template
  if (results.length === 1) {
    const result = results[0];
    const proteinName = extractProteinName(result);
    const description = extractDescription(result);
    const organism = extractOrganism(result);
    const refSeqInfo = extractRefSeqInfo(result);
    const stringIdLink = extractStringId(result);
    const subcellularLocation = extractSubcellularLocation(result);
    const { bioGridIdLink, flyBaseIdLink } = extractDatabaseLinks(result);
    const accession = result.primaryAccession || '';
    const url = `https://www.uniprot.org/uniprot/${accession}`;
    
    return `<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; background: linear-gradient(135deg, #cce0ff 0%, #b3d9ff 100%); border-radius: 10px; padding: 15px; box-shadow: 0 3px 6px rgba(0,0,0,0.1); margin-bottom: 15px; width: 200px; overflow: hidden; box-sizing: border-box;">
      <h3 style="color: #2a5db0; text-align: center; margin-top: 0;">UniProt Search Result</h3>
      <p><strong>Accession:</strong> <a href="${url}" target="_blank">${accession}</a></p>
      <p><strong>Protein Name:</strong> ${proteinName}</p>
      <p><strong>Organism:</strong> ${organism}</p>
      <div style="display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; word-break: break-all;"><strong>FlyBase:</strong> ${flyBaseIdLink}</div>
        <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; word-break: break-all;"><strong>BioGRID:</strong> ${bioGridIdLink}</div>
        <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; word-break: break-all;"><strong>STRING:</strong> ${stringIdLink}</div>
      </div>
      <p><strong>细胞定位:</strong> <span style="background: linear-gradient(135deg, #fff0f7 0%, #ffe6f2 100%); padding: 5px 10px; border-radius: 6px; border: 1px solid #ffb3d9; display: inline-block; width: 200px; overflow: hidden; text-overflow: ellipsis; word-break: break-all;">${subcellularLocation}</span></p>
      <div style="display: flex; align-items: center;"><strong>RefSeq:</strong> <span class="toggle-refseq" data-target="refseq-single">展开</span></div>
      <div id="refseq-single" style="background: linear-gradient(135deg, #f0fff0 0%, #e6ffe6 100%); padding: 10px; border-radius: 6px; margin-top: 5px; border: 1px solid #b3ffb3; display: none; width: 200px; overflow: hidden; word-break: break-all;">
        ${refSeqInfo}
      </div>
      <p><strong>Function:</strong></p>
      <div style="background: linear-gradient(135deg, #f0f7ff 0%, #e6f2ff 100%); padding: 10px; border-radius: 6px; margin-top: 5px; border: 1px solid #b3d1ff; width: 200px; overflow: hidden; word-break: break-all;">
        ${description}
      </div>
    </div>`;
  }

  // 多个结果使用垂直列表布局，优化为长条形
  let html = `<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin-bottom: 15px; background: linear-gradient(135deg, #e6f7ff 0%, #d1ecff 100%); padding: 8px 15px; border-radius: 8px; border: 1px solid #b3d9ff; box-shadow: 0 2px 4px rgba(0,0,0,0.05); width: 200px; overflow: hidden; box-sizing: border-box;">
    <h3 style="color: #2a5db0; text-align: center; margin: 5px 0; font-size: 16px;">UniProt Search Results (${results.length})</h3>
  </div>
  <div style="display: flex; flex-direction: column; gap: 12px; overflow-y: auto; padding-right: 5px; width: 200px; overflow-x: hidden; box-sizing: border-box;">`;
  
  results.forEach((result, index) => {
    const proteinName = extractProteinName(result);
    const description = extractDescription(result);
    const organism = extractOrganism(result);
    const refSeqInfo = extractRefSeqInfo(result);
    const stringIdLink = extractStringId(result);
    const subcellularLocation = extractSubcellularLocation(result);
    const { bioGridIdLink, flyBaseIdLink } = extractDatabaseLinks(result);
    const accession = result.primaryAccession || '';
    const url = `https://www.uniprot.org/uniprot/${accession}`;
    
    html += `<div style="background: linear-gradient(135deg, #f0f7ff 0%, #e6f2ff 100%); border-radius: 8px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border: 1px solid #b3d1ff; margin-bottom: 0; width: 200px; overflow: hidden; box-sizing: border-box;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 0; overflow: hidden;">
          <p style="margin: 0 0 4px 0; font-size: 14px; word-break: break-all;"><strong>Accession:</strong> <a href="${url}" target="_blank" style="color: #2a5db0; text-decoration: none;">${accession}</a></p>
          <p style="margin: 0 0 4px 0; font-size: 14px; word-break: break-all;"><strong>Protein:</strong> ${proteinName}</p>
          <p style="margin: 0 0 8px 0; font-size: 13px; color: #666; word-break: break-all;"><strong>Organism:</strong> ${organism}</p>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-end; min-width: 120px; word-break: break-all;">
          <span style="background: linear-gradient(135deg, #fff0f7 0%, #ffe6f2 100%); padding: 3px 8px; border-radius: 4px; border: 1px solid #ffb3d9; font-size: 12px; display: inline-block; width: 200px; overflow: hidden; text-overflow: ellipsis;">${subcellularLocation}</span>
          <button class="more-button" data-index="${index}" style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px; margin-top: 4px;">More</button>
        </div>
      </div>
      
      <div style="display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; font-size: 12px; word-break: break-all;">
        <span style="display: block; overflow: hidden; text-overflow: ellipsis;"><strong>FlyBase:</strong> ${flyBaseIdLink}</span>
        <span style="display: block; overflow: hidden; text-overflow: ellipsis;"><strong>BioGRID:</strong> ${bioGridIdLink}</span>
        <span style="display: block; overflow: hidden; text-overflow: ellipsis;"><strong>STRING:</strong> ${stringIdLink}</span>
      </div>
      
      <div style="display: flex; align-items: center; margin-bottom: 8px; font-size: 13px; word-break: break-all;">
        <strong>RefSeq:</strong> <span class="toggle-refseq" data-target="refseq-${index}" style="color: #0066cc; text-decoration: underline; cursor: pointer; margin-left: 5px;">展开</span>
      </div>
      
      <div id="refseq-${index}" style="background: linear-gradient(135deg, #f0fff0 0%, #e6ffe6 100%); padding: 8px; border-radius: 4px; margin-bottom: 8px; border: 1px solid #b3ffb3; display: none; font-size: 12px; width: 200px; overflow: hidden; word-break: break-all;">
        ${refSeqInfo}
      </div>
      
      <p style="margin: 0 0 4px 0; font-size: 13px;"><strong>Function:</strong></p>
      <div style="background: linear-gradient(135deg, #f0f7ff 0%, #e6f2ff 100%); padding: 8px; border-radius: 4px; border: 1px solid #b3d1ff; font-size: 12px; line-height: 1.4; width: 200px; overflow: hidden; word-break: break-all;">
        ${description}
      </div>
    </div>`;
  });
  
  html += '</div>';
  return html;
}

function extractProteinName(item: any): string {
  if (item.proteinDescription && item.proteinDescription.recommendedName) {
    return item.proteinDescription.recommendedName.fullName.value || '';
  }
  
  if (item.proteinDescription && item.proteinDescription.submissionNames && item.proteinDescription.submissionNames.length > 0) {
    return item.proteinDescription.submissionNames[0].fullName.value || '';
  }
  
  return 'Unknown Protein';
}

function extractDescription(item: any): string {
  let functionText = '';
  
  // 使用cc_function字段获取功能描述
  if (item.comments && Array.isArray(item.comments)) {
    const functionComment = item.comments.find((comment: any) => comment.commentType === 'FUNCTION');
    if (functionComment && functionComment.texts && functionComment.texts.length > 0) {
      functionText = functionComment.texts[0].value || '';
    }
  }
  
  // 如果comments中没有，尝试从cc_function字段获取
  if (!functionText && item.cc_function && Array.isArray(item.cc_function)) {
    functionText = item.cc_function.map((func: any) => func.value || '').join('; ') || '';
  }
  
  // 参考Chrome插件的处理逻辑：提取PubMed链接并格式化
  if (functionText) {
    // 提取PubMed引用并格式化链接
    functionText = functionText.replace(/\(PubMed:\d+(?:,\s*PubMed:\d+)*\)/g, function(match) {
      const pubmedRefs = match.replace(/[\(\)]/g, '');
      const ids = pubmedRefs.split(/,\s*/).map((ref: string) => ref.replace('PubMed:', ''));
      return '(' + ids.map((id: string) => `<a href="https://pubmed.ncbi.nlm.nih.gov/${id}/" target="_blank">PubMed:${id}</a>`).join(', ') + ')';
    });
    
    // 将文本转换为列表格式，参考Chrome插件的显示方式
    const sentences = functionText.split('.').map(s => s.trim()).filter(s => s);
    if (sentences.length > 0) {
      // 去重处理
      const uniqueSentences: string[] = [];
      const seen = new Set<string>();
      
      sentences.forEach(sentence => {
        const coreContent = sentence.replace(/\(PubMed:\d+(?:,\s*PubMed:\d+)*\)/g, '').trim();
        if (!seen.has(coreContent)) {
          seen.add(coreContent);
          uniqueSentences.push(sentence);
        }
      });
      
      // 取最长的5个句子
      const longestSentences = [...uniqueSentences]
        .sort((a, b) => b.length - a.length)
        .slice(0, 5);
      
      if (longestSentences.length > 0) {
        return `<ul style="margin: 0; padding-left: 20px;">${longestSentences.map(text => `<li>${text}.</li>`).join('')}</ul>`;
      }
    }
  }
  
  return '无功能注释';
}

function extractOrganism(item: any): string {
  if (item.organism && item.organism.scientificName) {
    return item.organism.scientificName;
  }
  
  return 'Unknown organism';
}

// 提取RefSeq信息，参考Chrome插件的实现
function extractRefSeqInfo(item: any): string {
  let refSeqInfo = [];

  if (item.uniProtKBCrossReferences && Array.isArray(item.uniProtKBCrossReferences)) {
    const refSeqEntries = item.uniProtKBCrossReferences.filter((ref: any) => ref.database === 'RefSeq');

    if (refSeqEntries.length > 0) {
      refSeqInfo = refSeqEntries.map((entry: any) => {
        const refSeqData = {
          id: entry.id || '无',
          nucleotideSequenceId: '无'
        };

        if (entry.properties && Array.isArray(entry.properties)) {
          const nucleotideProp = entry.properties.find((prop: any) => prop.key === 'NucleotideSequenceId');
          if (nucleotideProp) {
            refSeqData.nucleotideSequenceId = nucleotideProp.value;
          }
        }

        return refSeqData;
      });
    }
  }

  // 格式化RefSeq信息为HTML
  if (refSeqInfo.length > 0) {
    return refSeqInfo.map((item: any) => {
      const idPart = item.id !== '无' ? `<a href="https://www.ncbi.nlm.nih.gov/protein/${item.id}" target="_blank">${item.id}</a>` : '无';
      const nucleotidePart = item.nucleotideSequenceId !== '无' ? `<a href="https://www.ncbi.nlm.nih.gov/nuccore/${item.nucleotideSequenceId}" target="_blank">${item.nucleotideSequenceId}</a>` : '无';
      return `${idPart}, ${nucleotidePart}`;
    }).join('<br>');
  }

  return '无RefSeq信息';
}

// 提取STRING ID，参考Chrome插件的实现
function extractStringId(item: any): string {
  if (item.uniProtKBCrossReferences && Array.isArray(item.uniProtKBCrossReferences)) {
    const stringEntry = item.uniProtKBCrossReferences.find((ref: any) => ref.database === 'STRING');
    if (stringEntry && stringEntry.id) {
      return `<a href="javascript:void(0)" class="string-id-link" data-string-id="${encodeURIComponent(stringEntry.id)}">${stringEntry.id}</a>`;
    }
  }
  return '无';
}

// 提取细胞定位信息，参考Chrome插件的实现
function extractSubcellularLocation(item: any): string {
  let subcellularLocation = '无细胞定位信息';
  const locationMap = new Map();

  // 从comments中提取
  if (item.comments && Array.isArray(item.comments)) {
    const locationComment = item.comments.find((comment: any) => comment.commentType === 'SUBCELLULAR LOCATION');

    if (locationComment) {
      if (locationComment.subcellularLocations && Array.isArray(locationComment.subcellularLocations)) {
        locationComment.subcellularLocations.forEach((locItem: any) => {
          const location = locItem.location.value.trim();
          const normalizedLocation = location.replace(/[^\w\s]/g, '').toLowerCase();
          if (!locationMap.has(normalizedLocation)) {
            locationMap.set(normalizedLocation, location);
          }
        });

        const uniqueLocations = Array.from(locationMap.values());
        subcellularLocation = uniqueLocations.join('、');
      } else if (locationComment.texts && Array.isArray(locationComment.texts)) {
        let locationText = locationComment.texts[0].value;
        const locationMatch = locationText.match(/(?:Predominantly|Mainly|Localized to|Located in|Found in)\s+([\w\s]+)/i);
        if (locationMatch && locationMatch[1]) {
          subcellularLocation = locationMatch[1].trim();
        } else {
          subcellularLocation = locationText.trim();
        }
      }
    }
  }

  // 从cc_subcellular_location字段提取
  if (subcellularLocation === '无细胞定位信息' && item.cc_subcellular_location && Array.isArray(item.cc_subcellular_location)) {
    const locations = item.cc_subcellular_location.map((loc: any) => loc.location?.value || '').filter(Boolean);
    if (locations.length > 0) {
      subcellularLocation = [...new Set(locations)].join('、');
    }
  }

  return subcellularLocation;
}

// 提取BioGRID和FlyBase信息
function extractDatabaseLinks(item: any): { bioGridIdLink: string; flyBaseIdLink: string } {
  let bioGridIdLink = '无';
  let flyBaseIdLink = '无';

  if (item.uniProtKBCrossReferences && Array.isArray(item.uniProtKBCrossReferences)) {
    const bioGridRef = item.uniProtKBCrossReferences.find((ref: any) => ref.database === 'BioGRID');
    if (bioGridRef && bioGridRef.id) {
      bioGridIdLink = `<a href="https://thebiogrid.org/${bioGridRef.id}" target="_blank">${bioGridRef.id}</a>`;
    }

    const flyBaseRef = item.uniProtKBCrossReferences.find((ref: any) => ref.database === 'FlyBase');
    if (flyBaseRef && flyBaseRef.id) {
      flyBaseIdLink = `<a href="https://flybase.org/reports/${flyBaseRef.id}" target="_blank">${flyBaseRef.id}</a>`;
    }
  }

  return { bioGridIdLink, flyBaseIdLink };
}

export const UniProt: TranslateService = {
  id: "uniprot",
  type: "word",
  name: "UniProt Search",
  helpUrl: "https://www.uniprot.org/help/uniprotkb",
  async translate(data) {
    return await searchUniProt(data);
  },
};