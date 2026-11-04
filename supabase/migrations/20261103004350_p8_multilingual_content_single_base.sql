-- Content locales are document data. Interface locales remain ro/en.
-- ICU language aliases/catalog captured from the repository Node 22 runtime;
-- no inferred regions, provider calls, hosted writes, or user-data rewrites.
CREATE FUNCTION app.canonical_content_locale(value text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $fn$
DECLARE parts text[]; alias_parts text[]; result text; script text; region text; variants text[]:='{}'; part text; contextual text; i integer:=2;
 language_aliases jsonb:=$catalog${"aa":"aa","aar":"aa","ab":"ab","abk":"ab","ace":"ace","ach":"ach","ada":"ada","adp":"dz","ady":"ady","ae":"ae","aeb":"aeb","af":"af","afh":"afh","afr":"af","agq":"agq","ain":"ain","ajt":"aeb","aju":"jrb","ak":"ak","aka":"ak","akk":"akk","akz":"akz","alb":"sq","ale":"ale","aln":"aln","als":"sq","alt":"alt","am":"am","amh":"am","an":"an","ang":"ang","ann":"ann","anp":"anp","ar":"ar","ara":"ar","arb":"ar","arc":"arc","arg":"an","arm":"hy","arn":"arn","aro":"aro","arp":"arp","arq":"arq","ars":"ars","arw":"arw","ary":"ary","arz":"arz","as":"as","asa":"asa","ase":"ase","asm":"as","ast":"ast","atj":"atj","av":"av","ava":"av","ave":"ae","avk":"avk","awa":"awa","ay":"ay","aym":"ay","ayr":"ay","az":"az","aze":"az","azj":"az","ba":"ba","bak":"ba","bal":"bal","bam":"bm","ban":"ban","baq":"eu","bar":"bar","bas":"bas","bax":"bax","bbc":"bbc","bbj":"bbj","bcc":"bal","bcl":"bik","be":"be","bej":"bej","bel":"be","bem":"bem","ben":"bn","bew":"bew","bez":"bez","bfd":"bfd","bfq":"bfq","bg":"bg","bgc":"bgc","bgn":"bgn","bh":"bh","bho":"bho","bi":"bi","bih":"bho","bik":"bik","bin":"bin","bis":"bi","bjn":"bjn","bkm":"bkm","bla":"bla","blg":"iba","blo":"blo","blt":"blt","bm":"bm","bn":"bn","bo":"bo","bod":"bo","bos":"bs","bpy":"bpy","bqi":"bqi","br":"br","bra":"bra","bre":"br","brh":"brh","brx":"brx","bs":"bs","bss":"bss","bua":"bua","bug":"bug","bul":"bg","bum":"bum","bur":"my","bxk":"luy","bxr":"bua","byn":"byn","byv":"byv","ca":"ca","cad":"cad","car":"car","cat":"ca","cay":"cay","cch":"cch","ccp":"ccp","ce":"ce","ceb":"ceb","ces":"cs","cgg":"cgg","ch":"ch","cha":"ch","chb":"chb","che":"ce","chg":"chg","chi":"zh","chk":"chk","chm":"chm","chn":"chn","cho":"cho","chp":"chp","chr":"chr","chu":"cu","chv":"cv","chy":"chy","cic":"cic","ckb":"ckb","clc":"clc","cld":"syr","cls":"sa","cmn":"zh","cnr":"sr-ME","co":"co","cop":"cop","cor":"kw","cos":"co","cps":"cps","cr":"cr","cre":"cr","crg":"crg","crh":"crh","crj":"crj","crk":"crk","crl":"crl","crm":"crm","crr":"crr","crs":"crs","cs":"cs","csb":"csb","csw":"csw","cu":"cu","cv":"cv","cwd":"cr","cy":"cy","cym":"cy","cze":"cs","da":"da","dak":"dak","dan":"da","dar":"dar","dav":"dav","de":"de","del":"del","den":"den","deu":"de","dgo":"doi","dgr":"dgr","dhd":"mwr","dik":"din","din":"din","diq":"zza","div":"dv","dje":"dje","doi":"doi","drh":"mn","drw":"fa-AF","dsb":"dsb","dtp":"dtp","dua":"dua","dum":"dum","dut":"nl","dv":"dv","dyo":"dyo","dyu":"dyu","dz":"dz","dzg":"dzg","dzo":"dz","ebu":"ebu","ee":"ee","efi":"efi","egl":"egl","egy":"egy","eka":"eka","ekk":"et","el":"el","ell":"el","elx":"elx","emk":"man","en":"en","eng":"en","enm":"enm","eo":"eo","epo":"eo","es":"es","esk":"ik","est":"et","esu":"esu","et":"et","eu":"eu","eus":"eu","ewe":"ee","ewo":"ewo","ext":"ext","fa":"fa","fan":"fan","fao":"fo","fas":"fa","fat":"ak","ff":"ff","fi":"fi","fij":"fj","fil":"fil","fin":"fi","fit":"fit","fj":"fj","fo":"fo","fon":"fon","fr":"fr","fra":"fr","frc":"frc","fre":"fr","frm":"frm","fro":"fro","frp":"frp","frr":"frr","frs":"frs","fry":"fy","fuc":"ff","ful":"ff","fur":"fur","fy":"fy","ga":"ga","gaa":"gaa","gag":"gag","gan":"gan","gay":"gay","gaz":"om","gba":"gba","gbo":"grb","gbz":"gbz","gd":"gd","geo":"ka","ger":"de","gez":"gez","gil":"gil","gl":"gl","gla":"gd","gle":"ga","glg":"gl","glk":"glk","glv":"gv","gmh":"gmh","gn":"gn","gno":"gon","goh":"goh","gom":"kok","gon":"gon","gor":"gor","got":"got","grb":"grb","grc":"grc","gre":"el","grn":"gn","gsw":"gsw","gu":"gu","guc":"guc","gug":"gn","guj":"gu","gur":"gur","guz":"guz","gv":"gv","gwi":"gwi","gya":"gba","ha":"ha","hai":"hai","hak":"hak","hat":"ht","hau":"ha","haw":"haw","hax":"hax","hbs":"sr-Latn","hdn":"hai","he":"he","hea":"hmn","heb":"he","her":"hz","hi":"hi","hif":"hif","hil":"hil","hin":"hi","hit":"hit","hmn":"hmn","hmo":"ho","hnj":"hnj","ho":"ho","hr":"hr","hrv":"hr","hsb":"hsb","hsn":"hsn","ht":"ht","hu":"hu","hun":"hu","hup":"hup","hur":"hur","hy":"hy","hye":"hy","hz":"hz","ia":"ia","iba":"iba","ibb":"ibb","ibo":"ig","ice":"is","id":"id","ido":"io","ie":"ie","ig":"ig","ii":"ii","iii":"ii","ik":"ik","ike":"iu","ikt":"ikt","iku":"iu","ile":"ie","ilo":"ilo","in":"id","ina":"ia","ind":"id","inh":"inh","io":"io","ipk":"ik","is":"is","isl":"is","it":"it","ita":"it","iu":"iu","iw":"he","izh":"izh","ja":"ja","jam":"jam","jav":"jv","jaw":"jv","jbo":"jbo","jgo":"jgo","ji":"yi","jmc":"jmc","jpn":"ja","jpr":"jpr","jrb":"jrb","jut":"jut","jv":"jv","jw":"jv","ka":"ka","kaa":"kaa","kab":"kab","kac":"kac","kaj":"kaj","kal":"kl","kam":"kam","kan":"kn","kas":"ks","kat":"ka","kau":"kr","kaw":"kaw","kaz":"kk","kbd":"kbd","kbl":"kbl","kcg":"kcg","kde":"kde","kea":"kea","kek":"kek","ken":"ken","kfo":"kfo","kg":"kg","kgp":"kgp","kha":"kha","khk":"mn","khm":"km","kho":"kho","khq":"khq","khw":"khw","ki":"ki","kik":"ki","kin":"rw","kir":"ky","kiu":"kiu","kj":"kj","kk":"kk","kkj":"kkj","kl":"kl","kln":"kln","km":"km","kmb":"kmb","kmr":"ku","kn":"kn","knc":"kr","kng":"kg","ko":"ko","koi":"koi","kok":"kok","kom":"kv","kon":"kg","kor":"ko","kos":"kos","kpe":"kpe","kpv":"kv","kr":"kr","krc":"krc","kri":"kri","krj":"krj","krl":"krl","kru":"kru","ks":"ks","ksb":"ksb","ksf":"ksf","ksh":"ksh","ktr":"dtp","ku":"ku","kua":"kj","kum":"kum","kur":"ku","kut":"kut","kv":"kv","kw":"kw","kwk":"kwk","kxl":"kru","kxv":"kxv","ky":"ky","kzj":"dtp","kzt":"dtp","la":"la","lad":"lad","lag":"lag","lah":"lah","lam":"lam","lao":"lo","lat":"la","lav":"lv","lb":"lb","lez":"lez","lfn":"lfn","lg":"lg","li":"li","lij":"lij","lil":"lil","lim":"li","lin":"ln","lit":"lt","liv":"liv","lkt":"lkt","lmo":"lmo","ln":"ln","lo":"lo","lol":"lol","lou":"lou","loz":"loz","lrc":"lrc","lsm":"lsm","lt":"lt","ltg":"ltg","ltz":"lb","lu":"lu","lua":"lua","lub":"lu","lug":"lg","lui":"lui","lun":"lun","luo":"luo","lus":"lus","luy":"luy","lv":"lv","lvs":"lv","lzh":"lzh","lzz":"lzz","mac":"mk","mad":"mad","maf":"maf","mag":"mag","mah":"mh","mai":"mai","mak":"mak","mal":"ml","man":"man","mao":"mi","mar":"mr","mas":"mas","may":"ms","mde":"mde","mdf":"mdf","mdr":"mdr","men":"men","mer":"mer","mfe":"mfe","mg":"mg","mga":"mga","mgh":"mgh","mgo":"mgo","mh":"mh","mhr":"chm","mi":"mi","mic":"mic","min":"min","mk":"mk","mkd":"mk","ml":"ml","mlg":"mg","mlt":"mt","mn":"mn","mnc":"mnc","mni":"mni","mo":"ro","moe":"moe","moh":"moh","mol":"ro","mon":"mn","mos":"mos","mr":"mr","mri":"mi","mrj":"mrj","ms":"ms","msa":"ms","mt":"mt","mua":"mua","mup":"raj","mus":"mus","mwl":"mwl","mwr":"mwr","mwv":"mwv","my":"my","mya":"my","mye":"mye","myv":"myv","mzn":"mzn","na":"na","nan":"nan","nap":"nap","naq":"naq","nau":"na","nav":"nv","nb":"nb","nbl":"nr","nd":"nd","nde":"nd","ndo":"ng","nds":"nds","ne":"ne","nep":"ne","new":"new","ng":"ng","nia":"nia","niu":"niu","njo":"njo","nl":"nl","nld":"nl","nmg":"nmg","nn":"nn","nnh":"nnh","nno":"nn","no":"no","nob":"nb","nog":"nog","non":"non","nor":"no","nov":"nov","npi":"ne","nqo":"nqo","nr":"nr","nso":"nso","nus":"nus","nv":"nv","nwc":"nwc","ny":"ny","nya":"ny","nym":"nym","nyn":"nyn","nyo":"nyo","nzi":"nzi","oc":"oc","oci":"oc","oj":"oj","ojb":"ojb","ojc":"ojc","ojg":"oj","oji":"oj","ojs":"ojs","ojw":"ojw","oka":"oka","om":"om","or":"or","ori":"or","orm":"om","ory":"or","os":"os","osa":"osa","oss":"os","ota":"ota","pa":"pa","pag":"pag","pal":"pal","pam":"pam","pan":"pa","pap":"pap","pau":"pau","pbu":"ps","pcd":"pcd","pcm":"pcm","pdc":"pdc","pdt":"pdt","peo":"peo","per":"fa","pes":"fa","pfl":"pfl","phn":"phn","pi":"pi","pis":"pis","pl":"pl","pli":"pi","plt":"mg","pmk":"crr","pms":"pms","pnb":"lah","pnt":"pnt","pol":"pl","pon":"pon","por":"pt","pqm":"pqm","prg":"prg","pro":"pro","prp":"gu","prs":"fa-AF","ps":"ps","pt":"pt","pus":"ps","qu":"qu","quc":"quc","que":"qu","qug":"qug","quz":"qu","raj":"raj","rap":"rap","rar":"rar","rgn":"rgn","rhg":"rhg","rif":"rif","rm":"rm","rmy":"rom","rn":"rn","ro":"ro","rof":"rof","roh":"rm","rom":"rom","ron":"ro","rtm":"rtm","ru":"ru","rue":"rue","rug":"rug","rum":"ro","run":"rn","rup":"rup","rus":"ru","rw":"rw","rwk":"rwk","sa":"sa","sad":"sad","sag":"sg","sah":"sah","sam":"sam","san":"sa","saq":"saq","sas":"sas","sat":"sat","saz":"saz","sba":"sba","sbp":"sbp","sc":"sc","scc":"sr","scn":"scn","sco":"sco","scr":"hr","sd":"sd","sdc":"sdc","sdh":"sdh","se":"se","see":"see","seh":"seh","sei":"sei","sel":"sel","ses":"ses","sg":"sg","sga":"sga","sgs":"sgs","sh":"sr-Latn","shi":"shi","shn":"shn","shu":"shu","si":"si","sid":"sid","sin":"si","sk":"sk","sl":"sl","slh":"slh","sli":"sli","slk":"sk","slo":"sk","slv":"sl","sly":"sly","sm":"sm","sma":"sma","smd":"kmb","sme":"se","smj":"smj","smn":"smn","smo":"sm","sms":"sms","sn":"sn","sna":"sn","snb":"iba","snd":"sd","snk":"snk","so":"so","sog":"sog","som":"so","sot":"st","spa":"es","spy":"kln","sq":"sq","sqi":"sq","sr":"sr","src":"sc","srd":"sc","srn":"srn","srp":"sr","srr":"srr","ss":"ss","ssw":"ss","ssy":"ssy","st":"st","stq":"stq","str":"str","su":"su","suk":"suk","sun":"su","sus":"sus","sux":"sux","sv":"sv","sw":"sw","swa":"sw","swb":"swb","swc":"sw-CD","swe":"sv","swh":"sw","syc":"syc","syr":"syr","szl":"szl","ta":"ta","tah":"ty","tam":"ta","tat":"tt","tce":"tce","tcy":"tcy","tdu":"dtp","te":"te","tel":"te","tem":"tem","teo":"teo","ter":"ter","tet":"tet","tg":"tg","tgk":"tg","tgl":"fil","tgx":"tgx","th":"th","tha":"th","tht":"tht","ti":"ti","tib":"bo","tig":"tig","tir":"ti","tiv":"tiv","tk":"tk","tkl":"tkl","tkr":"tkr","tl":"fil","tlh":"tlh","tli":"tli","tly":"tly","tmh":"tmh","tn":"tn","tnf":"fa-AF","to":"to","tog":"tog","tok":"tok","ton":"to","tpi":"tpi","tr":"tr","tru":"tru","trv":"trv","trw":"trw","ts":"ts","tsd":"tsd","tsi":"tsi","tsn":"tn","tso":"ts","tt":"tt","ttm":"ttm","ttq":"tmh","ttt":"ttt","tuk":"tk","tum":"tum","tur":"tr","tvl":"tvl","tw":"tw","twi":"ak","twq":"twq","ty":"ty","tyv":"tyv","tzm":"tzm","udm":"udm","ug":"ug","uga":"uga","uig":"ug","uk":"uk","ukr":"uk","umb":"umb","umu":"del","ur":"ur","urd":"ur","uz":"uz","uzb":"uz","uzn":"uz","vai":"vai","ve":"ve","vec":"vec","ven":"ve","vep":"vep","vi":"vi","vie":"vi","vls":"vls","vmf":"vmf","vmw":"vmw","vo":"vo","vol":"vo","vot":"vot","vro":"vro","vun":"vun","wa":"wa","wae":"wae","wal":"wal","war":"war","was":"was","wbp":"wbp","wel":"cy","wln":"wa","wo":"wo","wol":"wo","wuu":"wuu","xal":"xal","xh":"xh","xho":"xh","xmf":"xmf","xnr":"xnr","xog":"xog","xpe":"kpe","xsl":"den","yao":"yao","yap":"yap","yav":"yav","ybb":"ybb","ydd":"yi","yi":"yi","yid":"yi","yo":"yo","yor":"yo","yrl":"yrl","yue":"yue","za":"za","zai":"zap","zap":"zap","zbl":"zbl","zea":"zea","zen":"zen","zgh":"zgh","zh":"zh","zha":"za","zho":"zh","zsm":"ms","zu":"zu","zul":"zu","zun":"zun","zyb":"za","zza":"zza"}$catalog$::jsonb;
 locale_region_aliases jsonb:=$catalog${"ab-172":"ab-GE","ab-810":"ab-GE","ab-SU":"ab-GE","akk-536":"akk-IQ","akk-NT":"akk-IQ","hy-172":"hy-AM","hy-810":"hy-AM","hy-SU":"hy-AM","az-172":"az-AZ","az-810":"az-AZ","az-SU":"az-AZ","be-172":"be-BY","be-810":"be-BY","be-SU":"be-BY","bs-890":"bs-BA","chg-172":"chg-TM","chg-810":"chg-TM","chg-SU":"chg-TM","ckb-536":"ckb-IQ","ckb-NT":"ckb-IQ","syr-536":"syr-IQ","syr-NT":"syr-IQ","crh-172":"crh-UA","crh-810":"crh-UA","crh-SU":"crh-UA","et-810":"et-EE","et-SU":"et-EE","gag-172":"gag-MD","gag-810":"gag-MD","gag-SU":"gag-MD","ka-172":"ka-GE","ka-810":"ka-GE","ka-SU":"ka-GE","got-172":"got-UA","got-810":"got-UA","got-SU":"got-UA","hr-890":"hr-HR","ie-810":"ie-EE","ie-SU":"ie-EE","yi-172":"yi-UA","yi-810":"yi-UA","yi-SU":"yi-UA","kaa-172":"kaa-UZ","kaa-810":"kaa-UZ","kaa-SU":"kaa-UZ","kk-172":"kk-KZ","kk-810":"kk-KZ","kk-SU":"kk-KZ","ky-172":"ky-KG","ky-810":"ky-KG","ky-SU":"ky-KG","lv-810":"lv-LV","lv-SU":"lv-LV","lt-810":"lt-LT","lt-SU":"lt-LT","liv-810":"liv-LV","liv-SU":"liv-LV","ltg-810":"ltg-LV","ltg-SU":"ltg-LV","mk-890":"mk-MK","mh-582":"mh-MH","mh-PC":"mh-MH","os-172":"os-GE","os-810":"os-GE","os-SU":"os-GE","pau-582":"pau-PW","pau-PC":"pau-PW","rue-172":"rue-UA","rue-810":"rue-UA","rue-SU":"rue-UA","sgs-810":"sgs-LT","sgs-SU":"sgs-LT","sk-200":"sk-SK","sl-890":"sl-SI","sog-172":"sog-UZ","sog-810":"sog-UZ","sog-SU":"sog-UZ","tg-172":"tg-TJ","tg-810":"tg-TJ","tg-SU":"tg-TJ","tk-172":"tk-TM","tk-810":"tk-TM","tk-SU":"tk-TM","tkr-172":"tkr-AZ","tkr-810":"tkr-AZ","tkr-SU":"tkr-AZ","tly-172":"tly-AZ","tly-810":"tly-AZ","tly-SU":"tly-AZ","ttt-172":"ttt-AZ","ttt-810":"ttt-AZ","ttt-SU":"ttt-AZ","uk-172":"uk-UA","uk-810":"uk-UA","uk-SU":"uk-UA","uz-172":"uz-UZ","uz-810":"uz-UZ","uz-SU":"uz-UZ","vro-810":"vro-EE","vro-SU":"vro-EE","xmf-172":"xmf-GE","xmf-810":"xmf-GE","xmf-SU":"xmf-GE","sgn-170":"csn","sgn-208":"dsl","sgn-249":"fsl","sgn-250":"fsl","sgn-276":"gsg","sgn-278":"gsg","sgn-280":"gsg","sgn-300":"gss","sgn-372":"isg","sgn-380":"ise","sgn-392":"jsl","sgn-484":"mfs","sgn-528":"dse","sgn-558":"ncs","sgn-578":"nsi","sgn-620":"psr","sgn-710":"sfs","sgn-724":"ssp","sgn-752":"swl","sgn-826":"bfi","sgn-840":"ase","sgn-DD":"gsg","sgn-FX":"fsl","sgn-UK":"bfi","sgn-076":"bzs","sgn-BR":"bzs","sgn-CO":"csn","sgn-DE":"gsg","sgn-DK":"dsl","sgn-ES":"ssp","sgn-FR":"fsl","sgn-GB":"bfi","sgn-GR":"gss","sgn-IE":"isg","sgn-IT":"ise","sgn-JP":"jsl","sgn-MX":"mfs","sgn-NI":"ncs","sgn-NL":"dse","sgn-NO":"nsl","sgn-PT":"psr","sgn-SE":"swl","sgn-US":"ase","sgn-ZA":"sfs"}$catalog$::jsonb;
 region_aliases jsonb:=$catalog${"100":"BG","104":"MM","108":"BI","112":"BY","116":"KH","120":"CM","124":"CA","132":"CV","136":"KY","140":"CF","144":"LK","148":"TD","152":"CL","156":"CN","158":"TW","162":"CX","166":"CC","170":"CO","172":"RU","174":"KM","175":"YT","178":"CG","180":"CD","184":"CK","188":"CR","191":"HR","192":"CU","196":"CY","200":"CZ","203":"CZ","204":"BJ","208":"DK","212":"DM","214":"DO","218":"EC","222":"SV","226":"GQ","230":"ET","231":"ET","232":"ER","233":"EE","234":"FO","238":"FK","239":"GS","242":"FJ","246":"FI","248":"AX","249":"FR","250":"FR","254":"GF","258":"PF","260":"TF","262":"DJ","266":"GA","268":"GE","270":"GM","275":"PS","276":"DE","278":"DE","280":"DE","288":"GH","292":"GI","296":"KI","300":"GR","304":"GL","308":"GD","312":"GP","316":"GU","320":"GT","324":"GN","328":"GY","332":"HT","334":"HM","336":"VA","340":"HN","344":"HK","348":"HU","352":"IS","356":"IN","360":"ID","364":"IR","368":"IQ","372":"IE","376":"IL","380":"IT","384":"CI","388":"JM","392":"JP","398":"KZ","400":"JO","404":"KE","408":"KP","410":"KR","414":"KW","417":"KG","418":"LA","422":"LB","426":"LS","428":"LV","430":"LR","434":"LY","438":"LI","440":"LT","442":"LU","446":"MO","450":"MG","454":"MW","458":"MY","462":"MV","466":"ML","470":"MT","474":"MQ","478":"MR","480":"MU","484":"MX","492":"MC","496":"MN","498":"MD","499":"ME","500":"MS","504":"MA","508":"MZ","512":"OM","516":"NA","520":"NR","524":"NP","528":"NL","530":"CW","531":"CW","532":"CW","533":"AW","534":"SX","535":"BQ","536":"SA","540":"NC","548":"VU","554":"NZ","558":"NI","562":"NE","566":"NG","570":"NU","574":"NF","578":"NO","580":"MP","581":"UM","582":"FM","583":"FM","584":"MH","585":"PW","586":"PK","591":"PA","598":"PG","600":"PY","604":"PE","608":"PH","612":"PN","616":"PL","620":"PT","624":"GW","626":"TL","630":"PR","634":"QA","638":"RE","642":"RO","643":"RU","646":"RW","652":"BL","654":"SH","659":"KN","660":"AI","662":"LC","663":"MF","666":"PM","670":"VC","674":"SM","678":"ST","682":"SA","686":"SN","688":"RS","690":"SC","694":"SL","702":"SG","703":"SK","704":"VN","705":"SI","706":"SO","710":"ZA","716":"ZW","720":"YE","724":"ES","728":"SS","729":"SD","732":"EH","736":"SD","740":"SR","744":"SJ","748":"SZ","752":"SE","756":"CH","760":"SY","762":"TJ","764":"TH","768":"TG","772":"TK","776":"TO","780":"TT","784":"AE","788":"TN","792":"TR","795":"TM","796":"TC","798":"TV","800":"UG","804":"UA","807":"MK","810":"RU","818":"EG","826":"GB","830":"JE","831":"GG","832":"JE","833":"IM","834":"TZ","840":"US","850":"VI","854":"BF","858":"UY","860":"UZ","862":"VE","876":"WF","882":"WS","886":"YE","887":"YE","890":"RS","891":"RS","894":"ZM","958":"AA","959":"QM","960":"QN","962":"QP","963":"QQ","964":"QR","965":"QS","966":"QT","967":"EU","968":"QV","969":"QW","970":"QX","971":"QY","972":"QZ","973":"XA","974":"XB","975":"XC","976":"XD","977":"XE","978":"XF","979":"XG","980":"XH","981":"XI","982":"XJ","983":"XK","984":"XL","985":"XM","986":"XN","987":"XO","988":"XP","989":"XQ","990":"XR","991":"XS","992":"XT","993":"XU","994":"XV","995":"XW","996":"XX","997":"XY","998":"XZ","999":"ZZ","AN":"CW","BU":"MM","CS":"RS","CT":"KI","DD":"DE","DY":"BJ","FQ":"AQ","FX":"FR","HV":"BF","JT":"UM","MI":"UM","NH":"VU","NQ":"AQ","NT":"SA","PC":"FM","PU":"UM","PZ":"PA","QU":"EU","RH":"ZW","SU":"RU","TP":"TL","UK":"GB","VD":"VN","WK":"UM","YD":"YE","YU":"RS","ZR":"CD","004":"AF","008":"AL","010":"AQ","012":"DZ","016":"AS","020":"AD","024":"AO","028":"AG","031":"AZ","032":"AR","036":"AU","040":"AT","044":"BS","048":"BH","050":"BD","051":"AM","052":"BB","056":"BE","060":"BM","062":"034","064":"BT","068":"BO","070":"BA","072":"BW","074":"BV","076":"BR","084":"BZ","086":"IO","090":"SB","092":"VG","096":"BN"}$catalog$::jsonb;
BEGIN
 IF value IS NULL OR length(value)>35 OR value !~ '^[A-Za-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|[0-9]{3}))?(-([A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*$' THEN RETURN NULL;END IF;
 parts:=string_to_array(value,'-');alias_parts:=string_to_array(coalesce(language_aliases->>lower(parts[1]),CASE WHEN lower(parts[1]) IN ('sgn','art','cel') THEN lower(parts[1]) END),'-');result:=alias_parts[1];IF result IS NULL THEN RETURN NULL;END IF;
 IF parts[i] ~ '^[A-Za-z]{4}$' THEN script:=upper(left(parts[i],1))||lower(substr(parts[i],2));i:=i+1;END IF;
 IF parts[i] ~ '^([A-Za-z]{2}|[0-9]{3})$' THEN region:=upper(parts[i]);i:=i+1;END IF;
 IF alias_parts[2] ~ '^[A-Za-z]{4}$' THEN script:=coalesce(script,alias_parts[2]);region:=coalesce(region,alias_parts[3]);ELSE region:=coalesce(region,alias_parts[2]);END IF;
 IF script='Qaai' THEN script:='Zinh';END IF;
 contextual:=locale_region_aliases->>(result||'-'||region);
 IF contextual IS NOT NULL THEN
  alias_parts:=string_to_array(contextual,'-');result:=alias_parts[1];
  IF alias_parts[2] ~ '^[A-Za-z]{4}$' THEN script:=coalesce(script,alias_parts[2]);region:=alias_parts[3];ELSE region:=alias_parts[2];END IF;
 ELSE region:=coalesce(region_aliases->>region,region);END IF;
 IF script IS NOT NULL THEN result:=result||'-'||script;END IF;
 IF region IS NOT NULL THEN result:=result||'-'||region;END IF;
 WHILE i<=array_length(parts,1) LOOP
  part:=CASE lower(parts[i]) WHEN 'heploc' THEN 'alalc97' WHEN 'polytoni' THEN 'polyton' ELSE lower(parts[i]) END;IF part=ANY(variants) THEN RETURN NULL;END IF;variants:=array_append(variants,part);i:=i+1;
 END LOOP;
 IF 'alalc97'=ANY(variants) THEN variants:=array_remove(variants,'hepburn');END IF;
 IF (split_part(result,'-',1)='art' AND 'lojban'=ANY(variants)) OR (split_part(result,'-',1)='cel' AND 'gaulish'=ANY(variants)) OR (split_part(result,'-',1)='zh' AND variants && ARRAY['guoyu','hakka','xiang']) THEN
  result:=CASE WHEN split_part(result,'-',1)='art' THEN 'jbo' WHEN split_part(result,'-',1)='cel' THEN 'xtg' WHEN 'hakka'=ANY(variants) THEN 'hak' WHEN 'xiang'=ANY(variants) THEN 'hsn' ELSE 'zh' END||CASE WHEN script IS NULL THEN '' ELSE '-'||script END||CASE WHEN region IS NULL THEN '' ELSE '-'||region END;
  variants:=array_remove(array_remove(array_remove(array_remove(array_remove(variants,'lojban'),'gaulish'),'guoyu'),'hakka'),'xiang');
 END IF;
 FOR part IN SELECT v FROM unnest(variants) v ORDER BY v LOOP result:=result||'-'||part;END LOOP;
 IF NOT language_aliases ? split_part(result,'-',1) THEN RETURN NULL;END IF;
 RETURN result;
END $fn$;
CREATE FUNCTION app.job_locale_key(value text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE app.canonical_content_locale(value) WHEN 'ro-RO' THEN 'ro' WHEN 'en-GB' THEN 'en' ELSE app.canonical_content_locale(value) END
$$;
CREATE FUNCTION app.document_content_locale(payload jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(app.canonical_content_locale(payload#>>'{content,translation,documentLocale}'),app.canonical_content_locale(payload#>>'{content,contentLanguage,locale}'),app.canonical_content_locale(payload#>>'{content,documentLocale}'),CASE payload#>>'{content,language}' WHEN 'ro' THEN 'ro-RO' WHEN 'en' THEN 'en-GB' ELSE app.canonical_content_locale(payload#>>'{content,language}') END)
$$;
REVOKE ALL ON FUNCTION app.canonical_content_locale(text),app.job_locale_key(text),app.document_content_locale(jsonb) FROM PUBLIC,anon,authenticated;
-- Preserve legacy default keys and the current unique index; explicit variants
-- keep their complete canonical tag. Existing rows do not change identity.
DO $constraints$
DECLARE c record;
BEGIN
 FOR c IN SELECT conrelid::regclass AS relation,conname FROM pg_constraint WHERE connamespace='app'::regnamespace AND contype='c' AND ((conrelid='app.job_editor_documents'::regclass AND pg_get_constraintdef(oid) LIKE '%document_locale%') OR (conrelid='app.job_workflow_operations'::regclass AND (pg_get_constraintdef(oid) LIKE '%requested_locale%' OR pg_get_constraintdef(oid) LIKE '%target_locale%'))) LOOP EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',c.relation,c.conname);END LOOP;
END $constraints$;
ALTER TABLE app.job_editor_documents ADD CONSTRAINT job_document_locale_valid CHECK(app.job_locale_key(document_locale) IS NOT NULL AND app.job_locale_key(document_locale)=document_locale);
ALTER TABLE app.job_workflow_operations ADD CONSTRAINT job_requested_locale_valid CHECK(requested_locale IS NULL OR (app.job_locale_key(requested_locale) IS NOT NULL AND app.job_locale_key(requested_locale)=requested_locale));
ALTER TABLE app.job_workflow_operations ADD CONSTRAINT job_target_locale_valid CHECK(app.job_locale_key(target_locale) IS NOT NULL AND app.job_locale_key(target_locale)=target_locale);
ALTER TABLE app.job_workflow_operations ADD COLUMN language_policy_version text;
ALTER TABLE app.job_workflow_operations ALTER COLUMN language_policy_version SET DEFAULT 'cv-language/1';
-- Patch only observed locale predicates; retain ownership, locks, grants,
-- snapshots, generation fences, request receipts, and workspace answer pins.
DO $locale_functions$
DECLARE f record; definition text;
BEGIN
 FOR f IN SELECT oid,proname FROM pg_proc WHERE pronamespace='app'::regnamespace AND proname IN ('current_job_document_row','load_current_job_document','save_current_job_document_before_workspace','request_job_workflow_before_workspace','translation_source_current','document_language_context','write_base_language','language_proposal_command','accept_language_proposal') LOOP
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(definition, 'p_locale NOT IN (''ro'',''en'')', 'app.job_locale_key(p_locale) IS NULL');
  definition:=replace(definition, 'p_payload#>>''{content,language}'' IS DISTINCT FROM p_locale', 'app.job_locale_key(app.document_content_locale(p_payload)) IS DISTINCT FROM p_locale');
  definition:=replace(definition, 'd.document_locale=p_locale', 'd.document_locale=app.job_locale_key(p_locale)');
  definition:=replace(definition, 'd.document_locale=split_part(source_locale,''-'',1)', 'd.document_locale=app.job_locale_key(source_locale)');
  definition:=replace(definition, 'lineage->>''documentLocale'' NOT IN (''ro-RO'',''en-GB'')', 'app.canonical_content_locale(lineage->>''documentLocale'') IS DISTINCT FROM lineage->>''documentLocale''' );
  definition:=replace(definition, 'p_input->>''sourceLocale'' NOT IN (''ro-RO'',''en-GB'')', 'app.canonical_content_locale(p_input->>''sourceLocale'') IS NULL');
  definition:=replace(definition, 'p_input->>''targetLocale'' NOT IN (''ro-RO'',''en-GB'')', 'app.canonical_content_locale(p_input->>''targetLocale'') IS NULL');
  definition:=replace(definition, 'split_part(p.request->>''targetLocale'',''-'',1)', 'app.job_locale_key(p.request->>''targetLocale'')');
  definition:=regexp_replace(definition,'coalesce\(b.payload#>>''\{content,documentLocale\}'',CASE b.payload#>>''\{content,language\}'' WHEN ''ro'' THEN ''ro-RO'' WHEN ''en'' THEN ''en-GB'' END\)', 'app.document_content_locale(b.payload)','g');
  definition:=regexp_replace(definition,'coalesce\(v.payload#>>''\{content,documentLocale\}'',CASE v.payload#>>''\{content,language\}'' WHEN ''ro'' THEN ''ro-RO'' (WHEN ''en'' THEN|ELSE) ''en-GB'' END\)', 'app.document_content_locale(v.payload)','g');
  definition:=replace(definition,'coalesce(c.payload#>>''{content,documentLocale}'',CASE d.document_locale WHEN ''ro'' THEN ''ro-RO'' ELSE ''en-GB'' END)','app.document_content_locale(c.payload)');
  IF f.proname IN ('save_current_job_document_before_workspace','request_job_workflow_before_workspace') THEN definition:=replace(definition,chr(10)||'BEGIN'||chr(10),chr(10)||'BEGIN'||chr(10)||' IF p_locale IS NOT NULL AND app.job_locale_key(p_locale) IS NULL THEN RAISE EXCEPTION USING ERRCODE=''PT400'',MESSAGE=''INVALID_COMMAND_ENVELOPE'';END IF; p_locale:=app.job_locale_key(p_locale);'||chr(10));END IF;
  IF f.proname='request_job_workflow_before_workspace' THEN
   definition:=replace(definition,'target_locale:=coalesce(p_locale,s.payload#>>''{content,language}'',''ro'');','target_locale:=coalesce(p_locale,(SELECT d.document_locale FROM app.job_editor_documents d JOIN app.job_editor_versions v ON v.document_id=d.id WHERE v.id=doc),app.job_locale_key(app.document_content_locale(s.payload)),''ro'');');
   -- Extraction commentary uses the owned Base, or the interface preference.
   definition:=replace(definition,'coalesce(target_locale,''ro'')','coalesce(target_locale,app.job_locale_key(app.document_content_locale((SELECT payload FROM app.current_base_snapshot(w)))),(SELECT ui_locale FROM app.user_profiles WHERE user_id=app.require_user()),''ro'')');
  END IF;
  EXECUTE definition;
 END LOOP;
END $locale_functions$;

-- Intake and review share an exact first source + deletion generation. A staged
-- first review may already have a draft; that does not authorize another upload.
ALTER TABLE app.base_cv_lifecycle ADD COLUMN initial_import_id uuid;
ALTER TABLE app.cv_import_sessions ADD COLUMN base_generation bigint NOT NULL DEFAULT 0 CHECK(base_generation>=0);
-- Adopt the original staged import or the current already-accepted legacy import.
-- A historical accepted A -> B update remains editable; an unaccepted staged
-- update does not acquire authority merely by appearing in the latest snapshot.
UPDATE app.base_cv_lifecycle l SET initial_import_id=s.source_id
FROM app.cv_import_sessions s
WHERE s.tenant_id=l.tenant_id
AND s.source_id::text=(SELECT b.payload#>>'{content,importReview,id}' FROM app.editor_draft_snapshots b WHERE b.tenant_id=l.tenant_id AND b.variant_id='default' ORDER BY revision DESC LIMIT 1)
AND (s.source_id::text=(SELECT b.payload#>>'{content,importReview,id}' FROM app.editor_draft_snapshots b WHERE b.tenant_id=l.tenant_id AND b.variant_id='default' ORDER BY revision LIMIT 1)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(s.review_decisions) receipt JOIN app.editor_draft_snapshots accepted ON accepted.tenant_id=s.tenant_id AND accepted.id=(receipt->>'snapshotId')::uuid AND accepted.variant_id='default' WHERE accepted.payload#>>'{content,importReview,id}'=s.source_id::text AND jsonb_array_length(coalesce(accepted.payload#>'{content,importReview,confirmedIds}','[]'))>0));
UPDATE app.base_cv_lifecycle l SET initial_import_id=(SELECT s.source_id FROM app.cv_import_sessions s WHERE s.tenant_id=l.tenant_id AND s.state IN ('uploading','uploaded','processing','ready','unknown') AND s.expires_at>now() ORDER BY s.created_at DESC,s.source_id DESC LIMIT 1)
WHERE l.initial_import_id IS NULL AND NOT EXISTS(SELECT 1 FROM app.editor_draft_snapshots b WHERE b.tenant_id=l.tenant_id AND b.variant_id='default');
UPDATE app.cv_import_sessions s SET base_generation=l.generation FROM app.base_cv_lifecycle l WHERE s.tenant_id=l.tenant_id AND s.source_id=l.initial_import_id;
CREATE FUNCTION app.initial_import_current(w uuid,source uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM app.base_cv_lifecycle l JOIN app.cv_import_sessions s ON s.tenant_id=l.tenant_id AND s.source_id=source WHERE l.tenant_id=w AND w=app.tenant_for_user() AND l.initial_import_id=source AND s.base_generation=l.generation AND (NOT EXISTS(SELECT 1 FROM app.editor_draft_snapshots b WHERE b.tenant_id=w AND b.variant_id='default') OR (SELECT b.payload#>>'{content,importReview,id}' FROM app.editor_draft_snapshots b WHERE b.tenant_id=w AND b.variant_id='default' ORDER BY b.revision DESC LIMIT 1)=source::text))
$$;
REVOKE ALL ON FUNCTION app.initial_import_current(uuid,uuid) FROM PUBLIC,anon,authenticated;
DO $import_guards$
DECLARE definition text; marker text;
BEGIN
 definition:=pg_get_functiondef('app.begin_cv_import(uuid,text,text,bigint,bigint)'::regprocedure);
 marker:='IF r.cached IS NOT NULL THEN RETURN jsonb_build_object(''created'',false,''record'',app.get_cv_import(p_operation)); END IF;';
 IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Import replay guard marker missing';END IF;
 definition:=replace(definition,marker,'IF r.cached IS NOT NULL THEN IF NOT app.initial_import_current(w,(SELECT source_id FROM app.cv_import_sessions WHERE tenant_id=w AND operation_id=p_operation)) THEN RAISE EXCEPTION USING ERRCODE=''PT409'',MESSAGE=''BASE_CV_EXISTS'';END IF; RETURN jsonb_build_object(''created'',false,''record'',app.get_cv_import(p_operation));END IF;
 IF (SELECT id FROM app.current_base_snapshot(w)) IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE=''PT409'',MESSAGE=''BASE_CV_EXISTS'';END IF;');
 definition:=replace(definition,'state IN (''uploading'',''uploaded'',''processing'')','state IN (''uploading'',''uploaded'',''processing'',''ready'')');
 marker:='RETURN app.finish_request(w,r.request_id,jsonb_build_object(''created'',true,''record'',app.cv_import_json(s)));';
 IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Import admission guard marker missing';END IF;
 definition:=replace(definition,marker,'UPDATE app.base_cv_lifecycle SET initial_import_id=source WHERE tenant_id=w;
 UPDATE app.cv_import_sessions SET base_generation=(SELECT generation FROM app.base_cv_lifecycle WHERE tenant_id=w) WHERE source_id=source RETURNING * INTO s;
 '||marker);
 EXECUTE definition;
 definition:=pg_get_functiondef('app.save_import_review_draft(uuid,bigint,jsonb,uuid,jsonb)'::regprocedure);
 definition:=replace(definition,chr(10)||'BEGIN'||chr(10),chr(10)||'BEGIN'||chr(10)||' PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;
 PERFORM app.assert_tenant(w);
 IF NOT app.initial_import_current(w,p_import) THEN RAISE EXCEPTION USING ERRCODE=''PT409'',MESSAGE=''BASE_CV_EXISTS'';END IF;
');
 EXECUTE definition;
 definition:=pg_get_functiondef('app.get_pending_cv_import()'::regprocedure);
 definition:=replace(definition,'WHERE tenant_id=w AND state=''ready''','WHERE tenant_id=w AND app.initial_import_current(w,source_id) AND state=''ready''');
 EXECUTE definition;
END $import_guards$;
-- Direct old-client staging cannot replace a manual/existing Base or publish an
-- import from another lifecycle. Same-initial staging/autosave stays resumable.
CREATE FUNCTION app.guard_initial_import_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source text:=NEW.payload#>>'{content,importReview,id}';
BEGIN
 IF NEW.variant_id<>'default' OR source IS NULL THEN RETURN NEW;END IF;
 PERFORM 1 FROM app.tenants WHERE id=NEW.tenant_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM app.editor_draft_snapshots b WHERE b.tenant_id=NEW.tenant_id AND b.variant_id='default') AND NOT EXISTS(SELECT 1 FROM app.cv_import_sessions s WHERE s.tenant_id=NEW.tenant_id) THEN RETURN NEW;END IF;
 IF (SELECT b.payload#>>'{content,importReview,id}' FROM app.editor_draft_snapshots b WHERE b.tenant_id=NEW.tenant_id AND b.variant_id='default' ORDER BY revision DESC LIMIT 1)=source AND NOT EXISTS(SELECT 1 FROM app.cv_import_sessions s WHERE s.tenant_id=NEW.tenant_id) THEN RETURN NEW;END IF;
 IF source !~ '^[a-fA-F0-9-]{36}$' OR NOT app.initial_import_current(NEW.tenant_id,source::uuid) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='BASE_CV_EXISTS';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_initial_import_snapshot BEFORE INSERT ON app.editor_draft_snapshots FOR EACH ROW EXECUTE FUNCTION app.guard_initial_import_snapshot();
REVOKE ALL ON FUNCTION app.guard_initial_import_snapshot() FROM PUBLIC,anon,authenticated;

-- Historical receipts remain readable; only compatible new operations supply
-- current suggestions or proposals. Snapshot/revision fences still apply.
DO $policy$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('app.job_workflow_json(app.job_workflow_operations)'::regprocedure);
 definition:=replace(definition,$m$'id',o.id,'kind'$m$,$m$'languagePolicyVersion',o.language_policy_version,'id',o.id,'kind'$m$);
 EXECUTE definition;
 definition:=pg_get_functiondef('app.request_job_workflow_before_workspace(uuid,uuid,text,bigint,text,text)'::regprocedure);
 definition:=replace(definition,$m$kind='match' AND state='ready'$m$,$m$kind='match' AND language_policy_version='cv-language/1' AND state='ready'$m$);
 EXECUTE definition;
 definition:=pg_get_functiondef('app.save_current_job_document_before_workspace(uuid,uuid,text,uuid,bigint,jsonb,uuid,jsonb,uuid)'::regprocedure);
 definition:=replace(definition,$m$id=p_operation AND kind='tailor' AND state='ready'$m$,$m$id=p_operation AND kind='tailor' AND language_policy_version='cv-language/1' AND state='ready'$m$);
 EXECUTE definition;
END $policy$;

DO $worker_language$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('app.claim_job_workflow_before_workspace(text,boolean)'::regprocedure);
 definition:=replace(definition,$m$'base',s.payload$m$,$m$'base',coalesce(s.payload,(SELECT b.payload FROM app.editor_draft_snapshots b WHERE b.tenant_id=o.tenant_id AND b.variant_id='default' ORDER BY b.revision DESC LIMIT 1))$m$);
 EXECUTE definition;
 definition:=pg_get_functiondef('app.finish_job_workflow_before_workspace(text,uuid,jsonb,text)'::regprocedure);
 definition:=replace(definition,$m$'OUTPUT_INVALID','PROVIDER_UNAVAILABLE','INTERRUPTED','INPUT_TOO_LARGE'$m$,$m$'OUTPUT_INVALID','PROVIDER_UNAVAILABLE','INTERRUPTED','INPUT_TOO_LARGE','CONTENT_LANGUAGE_REQUIRED','CONTENT_LANGUAGE_UNAVAILABLE'$m$);
 EXECUTE definition;
END $worker_language$;

DO $clear_import_identity$
DECLARE definition text;marker text:=$m$IF (v->>'generation')::bigint=previous_generation THEN RETURN v;END IF;$m$;
BEGIN
 definition:=pg_get_functiondef('app.remove_base_cv(uuid,bigint,bigint)'::regprocedure);
 IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Removal generation marker missing';END IF;
 EXECUTE replace(definition,marker,marker||' UPDATE app.base_cv_lifecycle SET initial_import_id=NULL WHERE tenant_id=w;');
END $clear_import_identity$;

-- Actual interface preference is only an extraction fallback. Saved job language
-- and then Base language always take precedence. Keep the old RPC signatures for
-- existing clients; new transports use explicit *_with_locale entry points.
ALTER TABLE app.job_workflows ADD COLUMN interface_locale text CHECK(interface_locale IN ('ro','en'));
CREATE FUNCTION app.job_extraction_locale(w uuid,job uuid,requested text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(
  (SELECT app.job_locale_key(app.document_content_locale(v.payload)) FROM app.current_job_document_row(w,job,requested) v),
  (SELECT app.job_locale_key(app.document_content_locale(b.payload)) FROM app.editor_draft_snapshots b WHERE b.tenant_id=w AND b.variant_id='default' ORDER BY b.revision DESC LIMIT 1),
  (SELECT f.interface_locale FROM app.job_workflows f WHERE f.tenant_id=w AND f.job_id=job),
  (SELECT p.ui_locale FROM app.user_profiles p JOIN app.tenants t ON t.owner_user_id=p.user_id WHERE t.id=w),'ro')
$$;
CREATE FUNCTION app.pin_job_extraction_language() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.kind IN ('fetch','extract') THEN
  NEW.target_locale:=app.job_extraction_locale(NEW.tenant_id,NEW.job_id,NEW.requested_locale);
  IF NEW.kind='extract' THEN
   SELECT v.id INTO NEW.document_version_id FROM app.current_job_document_row(NEW.tenant_id,NEW.job_id,NEW.requested_locale) v;
   NEW.target_document_version_id:=NEW.document_version_id;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pin_job_extraction_language BEFORE INSERT ON app.job_workflow_operations FOR EACH ROW EXECUTE FUNCTION app.pin_job_extraction_language();
CREATE FUNCTION app.record_job_interface_locale(w uuid,job uuid,interface text,replace_existing boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF interface IS NOT NULL AND interface NOT IN ('ro','en') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 IF w IS DISTINCT FROM app.tenant_for_user() THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN';END IF;
 UPDATE app.job_workflows f SET interface_locale=CASE WHEN replace_existing THEN coalesce(interface,f.interface_locale,(SELECT ui_locale FROM app.user_profiles WHERE user_id=app.require_user()),'ro') ELSE coalesce(f.interface_locale,interface,(SELECT ui_locale FROM app.user_profiles WHERE user_id=app.require_user()),'ro') END WHERE f.tenant_id=w AND f.job_id=job;
 -- Creation queues extraction in an existing trigger, within this transaction.
 -- Resolve its fallback after recording the supplied interface preference.
 UPDATE app.job_workflow_operations o SET target_locale=app.job_extraction_locale(w,job,o.requested_locale) WHERE o.tenant_id=w AND o.job_id=job AND o.kind IN ('fetch','extract') AND o.state='queued';
END $$;
CREATE FUNCTION app.save_target_job_with_locale(p_key uuid,p_snapshot uuid,p_revision bigint,p_intake jsonb,p_requirements jsonb,p_interface_locale text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved jsonb;w uuid;
BEGIN
 IF p_interface_locale IS NOT NULL AND p_interface_locale NOT IN ('ro','en') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 PERFORM app.provision_workspace(p_key);w:=app.tenant_for_user();PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;
 saved:=app.save_target_job(p_key,p_snapshot,p_revision,p_intake,p_requirements);
 PERFORM app.record_job_interface_locale(w,(saved->>'id')::uuid,p_interface_locale);
 RETURN saved;
END $$;
CREATE FUNCTION app.save_target_url_with_locale(p_key uuid,p_url text,p_interface_locale text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved jsonb;w uuid;
BEGIN
 IF p_interface_locale IS NOT NULL AND p_interface_locale NOT IN ('ro','en') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 PERFORM app.provision_workspace(p_key);w:=app.tenant_for_user();PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;
 saved:=app.save_target_url(p_key,p_url);
 PERFORM app.record_job_interface_locale(w,(saved->>'id')::uuid,p_interface_locale);
 RETURN saved;
END $$;
CREATE FUNCTION app.submit_workspace_intake_with_locale(p_key uuid,p_id uuid,p_revision bigint,p_interface_locale text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved jsonb;w uuid:=app.tenant_for_user();
BEGIN
 IF p_interface_locale IS NOT NULL AND p_interface_locale NOT IN ('ro','en') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;
 saved:=app.submit_workspace_intake(p_key,p_id,p_revision);
 PERFORM app.record_job_interface_locale(w,(saved->>'id')::uuid,p_interface_locale);
 RETURN saved;
END $$;
CREATE FUNCTION app.request_job_workflow_with_locale(p_key uuid,p_job uuid,p_kind text,p_revision bigint,p_target text,p_locale text,p_interface_locale text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user();
BEGIN
 IF p_interface_locale IS NOT NULL AND p_interface_locale NOT IN ('ro','en') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM app.job_workflow_operations WHERE tenant_id=w AND id=p_key) THEN PERFORM app.record_job_interface_locale(w,p_job,p_interface_locale,true);END IF;
 RETURN app.request_job_workflow(p_key,p_job,p_kind,p_revision,p_target,p_locale);
END $$;
REVOKE ALL ON FUNCTION app.job_extraction_locale(uuid,uuid,text),app.pin_job_extraction_language(),app.record_job_interface_locale(uuid,uuid,text,boolean),app.save_target_job_with_locale(uuid,uuid,bigint,jsonb,jsonb,text),app.save_target_url_with_locale(uuid,text,text),app.submit_workspace_intake_with_locale(uuid,uuid,bigint,text),app.request_job_workflow_with_locale(uuid,uuid,text,bigint,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.save_target_job_with_locale(uuid,uuid,bigint,jsonb,jsonb,text),app.save_target_url_with_locale(uuid,text,text),app.submit_workspace_intake_with_locale(uuid,uuid,bigint,text),app.request_job_workflow_with_locale(uuid,uuid,text,bigint,text,text,text) TO authenticated;
-- A pinned extraction cannot spend another attempt or publish commentary after
-- its owned job copy has been replaced/deleted. Source quotations stay original.
DO $extraction_fences$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('app.claim_job_workflow_before_workspace(text,boolean)'::regprocedure);
 definition:=replace(definition,$m$IF f.revision<>o.job_revision OR$m$,$m$IF (o.kind='extract' AND o.document_version_id IS DISTINCT FROM (SELECT v.id FROM app.current_job_document_row(o.tenant_id,o.job_id,o.requested_locale) v)) OR f.revision<>o.job_revision OR$m$);
 EXECUTE definition;
 definition:=pg_get_functiondef('app.finish_job_workflow_before_workspace(text,uuid,jsonb,text)'::regprocedure);
 definition:=replace(definition,$m$IF (o.kind IN ('match','tailor')$m$,$m$IF (o.kind='extract' AND doc IS DISTINCT FROM o.document_version_id) OR (o.kind IN ('match','tailor')$m$);
 EXECUTE definition;
 definition:=pg_get_functiondef('app.job_workflow_attempt_before_workspace(text,uuid,jsonb,text,jsonb)'::regprocedure);
 definition:=replace(definition,$m$(kind IN ('fetch','extract') OR$m$,$m$((kind='fetch' OR (kind='extract' AND document_version_id IS NOT DISTINCT FROM (SELECT v.id FROM app.current_job_document_row(job_workflow_operations.tenant_id,job_workflow_operations.job_id,requested_locale) v))) OR$m$);
 EXECUTE definition;
END $extraction_fences$;
