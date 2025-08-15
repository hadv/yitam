import { getQigongAcupoints, updateQigongAcupoint } from '../db/qigongDatabase';
import PinyinService from '../services/pinyinService';

/**
 * Script to generate Pinyin for existing acupoints that have Chinese characters but no Pinyin
 */
async function generatePinyinForExistingAcupoints() {
  console.log('🚀 Starting Pinyin generation for existing acupoints...');
  
  try {
    // Get all acupoints
    const acupoints = await getQigongAcupoints();
    console.log(`📊 Found ${acupoints.length} total acupoints`);

    // Filter acupoints that have Chinese characters but no Pinyin
    const acupointsNeedingPinyin = acupoints.filter(acupoint =>
      acupoint.chinese_characters &&
      acupoint.chinese_characters.trim() &&
      (!acupoint.pinyin || !acupoint.pinyin.trim()) &&
      PinyinService.containsChinese(acupoint.chinese_characters!)
    );

    console.log(`🎯 Found ${acupointsNeedingPinyin.length} acupoints needing Pinyin generation`);

    if (acupointsNeedingPinyin.length === 0) {
      console.log('✅ No acupoints need Pinyin generation. All done!');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    // Process each acupoint
    for (const acupoint of acupointsNeedingPinyin) {
      try {
        console.log(`\n🔄 Processing: ${acupoint.symbol} - "${acupoint.chinese_characters}"`);
        
        // Generate Pinyin
        const generatedPinyin = PinyinService.generateAcupointPinyin(acupoint.chinese_characters!);
        
        if (generatedPinyin) {
          // Update the acupoint with generated Pinyin
          const updated = await updateQigongAcupoint(acupoint.id!, {
            pinyin: generatedPinyin
          });

          if (updated) {
            console.log(`✅ Success: ${acupoint.symbol} -> "${generatedPinyin}"`);
            successCount++;
          } else {
            console.log(`❌ Failed to update: ${acupoint.symbol}`);
            errorCount++;
          }
        } else {
          console.log(`⚠️  No Pinyin generated for: ${acupoint.symbol} - "${acupoint.chinese_characters}"`);
          errorCount++;
        }
      } catch (error) {
        console.error(`❌ Error processing ${acupoint.symbol}:`, error);
        errorCount++;
      }
    }

    // Summary
    console.log('\n📈 Migration Summary:');
    console.log(`✅ Successfully updated: ${successCount} acupoints`);
    console.log(`❌ Errors: ${errorCount} acupoints`);
    console.log(`📊 Total processed: ${successCount + errorCount} acupoints`);
    
    if (successCount > 0) {
      console.log('\n🎉 Pinyin generation completed successfully!');
    }
    
  } catch (error) {
    console.error('💥 Fatal error during Pinyin generation:', error);
    process.exit(1);
  }
}

/**
 * Preview mode - shows what would be updated without making changes
 */
async function previewPinyinGeneration() {
  console.log('👀 Preview mode: Showing what would be updated...\n');
  
  try {
    const acupoints = await getQigongAcupoints();
    const acupointsNeedingPinyin = acupoints.filter(acupoint =>
      acupoint.chinese_characters &&
      acupoint.chinese_characters.trim() &&
      (!acupoint.pinyin || !acupoint.pinyin.trim()) &&
      PinyinService.containsChinese(acupoint.chinese_characters!)
    );

    console.log(`📊 Found ${acupointsNeedingPinyin.length} acupoints that would be updated:\n`);

    for (const acupoint of acupointsNeedingPinyin) {
      try {
        const generatedPinyin = PinyinService.generateAcupointPinyin(acupoint.chinese_characters!);
        console.log(`${acupoint.symbol}: "${acupoint.chinese_characters}" -> "${generatedPinyin}"`);
      } catch (error) {
        console.log(`${acupoint.symbol}: "${acupoint.chinese_characters}" -> ERROR: ${error}`);
      }
    }

    console.log('\n💡 To actually perform the update, run: npm run generate-pinyin');
    
  } catch (error) {
    console.error('Error in preview mode:', error);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const isPreview = args.includes('--preview') || args.includes('-p');
  
  if (isPreview) {
    await previewPinyinGeneration();
  } else {
    await generatePinyinForExistingAcupoints();
  }
  
  process.exit(0);
}

// Run the script if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Script execution failed:', error);
    process.exit(1);
  });
}

export { generatePinyinForExistingAcupoints, previewPinyinGeneration };
