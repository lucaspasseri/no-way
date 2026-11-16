// Run against a fresh tests/lab-preview.mjs database. Only the provider is mocked.
export default async function verifyLabRecovery(page, {baseURL='http://127.0.0.1:3107',screenshotDirectory}={}) {
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const errors=[],packs=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',async response=>{if(response.url().endsWith('/api/question-lab')){try{const json=await response.json();if(json.pack)packs.push(json.pack);}catch{/* cancelled read */}}});
  await page.goto(baseURL+'/question-lab');
  await page.getByRole('button',{name:'My own topic',exact:true}).click();
  await page.getByLabel('Your rabbit hole').fill('Browser recovery outage');
  await page.getByRole('button',{name:'Generate 10 questions',exact:true}).click();
  await page.getByRole('heading',{name:'A fresh pack. A new rabbit hole.',exact:true}).waitFor({timeout:60000});
  const pack=packs.at(-1);
  check(pack.accepted===10&&pack.attempts===6,'One recovered batch must consume six total calls, within the original seven-call pack budget');
  await page.getByRole('heading',{name:'Generation recovered',exact:true}).waitFor();
  check(await page.getByText('Questions were generated using an approved alternative model.',{exact:true}).isVisible(),'Successful fallback must be disclosed');
  const recovery=pack.recoveries.find(item=>item.usedAlternative);
  check(recovery?.providerCalls===2,'The failed primary and successful fallback must share one recovery');
  check(pack.recoveries.length===5,'Later successful batches must not erase the earlier recovery');
  await page.getByText('Recovery details',{exact:false}).click();
  check(await page.getByText('The provider was temporarily unavailable.',{exact:true}).count()>0,'The actual recovery trigger must be explained');
  await page.addStyleTag({content:'nextjs-portal {display:none!important}'});
  if(screenshotDirectory)await page.screenshot({path:`${screenshotDirectory}/recovery-success-en.png`,fullPage:true});
  await page.locator('nav summary').click();
  await page.getByLabel('Language',{exact:true}).selectOption('pt-BR');
  await page.locator('nav summary').click();
  await page.getByRole('heading',{name:'Geração recuperada',exact:true}).waitFor();
  check(await page.getByText('As perguntas foram geradas usando um modelo alternativo autorizado.',{exact:true}).isVisible(),'Recovery must translate after changing locale');
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.documentElement.scrollWidth===innerWidth);
  await page.locator('nav summary').click();await page.getByRole('button',{name:'Ativar tema escuro',exact:true}).click();await page.locator('nav summary').click();
  if(screenshotDirectory)await page.screenshot({path:`${screenshotDirectory}/recovery-success-pt-mobile-dark.png`,fullPage:true});
  check(errors.length===0,`Runtime errors: ${errors.join('; ')}`);
  return {accepted:pack.accepted,providerCalls:pack.attempts,recoveredBatchCalls:recovery.providerCalls,historyPreserved:true,locales:['en','pt-BR'],errors};
}
