import {gameExercises} from './games.js';
// Original teaching content. Levels describe exercise difficulty, not certification.
const units = [
 ['premiers-mots','A1','vocabulaire','Les premiers mots','First words','Pour saluer, on dit « Bonjour ». Pour remercier, on dit « Merci ».','Say “Bonjour” to greet someone and “Merci” to thank them.',[
  ['Tu rencontres un voisin le matin : ___ !','Bonjour',['Bonsoir','Bonjour','Au revoir'],'Bonjour est une salutation utilisée dans la journée.','Bonjour is a daytime greeting.'],
  ['Quel mot signifie “thank you” ?','Merci',['Merci','Salut','Demain'],'Merci permet de remercier.','Merci means thank you.'],
  ['Complète : Bonjour, je ___ Marie.','m’appelle',null,'Se présenter : je m’appelle + prénom.','To introduce yourself: je m’appelle + name.']]],
 ['etre-avoir','A1','conjugaison','Être et avoir','Being and having','Être : je suis, tu es, il/elle est, nous sommes, vous êtes, ils/elles sont. Avoir : j’ai, tu as, il/elle a, nous avons, vous avez, ils/elles ont.','French uses avoir for age: “J’ai vingt ans”, literally “I have twenty years”.',[
  ['Je ___ étudiant.','suis',['suis','est','ai'],'Avec je, être devient suis.','With je, être becomes suis.'],
  ['Nous ___ une voiture.','avons',['ont','sommes','avons'],'Avec nous, avoir devient avons.','With nous, avoir becomes avons.'],
  ['Elle ___ vingt ans.','a',null,'Pour exprimer l’âge, on utilise avoir.','Use avoir, not être, to state age.']]],
 ['articles','A1','accords','Un, une, des','Articles and gender','Un accompagne un nom masculin, une un nom féminin et des un nom pluriel. Apprends chaque nom avec son article.','Learn each noun together with its article. French nouns have grammatical gender.',[
  ['___ maison','une',['un','une','des'],'Maison est un nom féminin singulier.','Maison is feminine singular.'],
  ['___ livres (plusieurs)','des',null,'Des accompagne un nom pluriel.','Des is the plural indefinite article.'],
  ['___ jardin','un',null,'Jardin est masculin singulier.','Jardin is masculine singular.']]],
 ['present-er','A1','conjugaison','Le présent en -er','Present tense: -er verbs','Pour parler : je parle, tu parles, il parle, nous parlons, vous parlez, ils parlent.','Remove -er and add the ending. Final -ent in ils parlent is silent.',[
  ['Tu ___ français. (parler)','parles',null,'Avec tu, on ajoute -es au radical parl-.','For tu, add -es to parl-.'],
  ['Nous ___ à Douala. (habiter)','habitons',null,'Avec nous : habit- + ons.','For nous: habit- + ons.'],
  ['Vous ___ la musique. (aimer)','aimez',null,'Avec vous, la terminaison est -ez.','The vous ending is -ez.']]],
 ['phrase-negative','A1','syntaxe','Construire et nier','Sentences and negation','Une phrase simple suit souvent sujet + verbe + complément. À l’écrit, la négation encadre le verbe : ne … pas.','Basic order is subject + verb + complement. Written negation puts ne before the verb and pas after it.',[
  ['Remets dans l’ordre : français / parle / Je','Je parle français',null,'Le sujet Je précède le verbe parle.','The subject Je comes before the verb parle.'],
  ['Complète : Je ne parle ___ anglais.','pas',null,'La négation s’écrit ne … pas.','Written negation uses ne … pas.'],
  ['Complète : Elle ___ aime pas le café.','n’',null,'Ne devient n’ devant une voyelle.','Ne becomes n’ before a vowel.']]],
 ['adjectifs','A2','accords','Accorder les adjectifs','Adjective agreement','L’adjectif s’accorde avec le nom : un petit jardin, une petite maison, des petites maisons.','Adjectives agree in gender and number. They do not stay unchanged as in English.',[
  ['Une robe ___ (bleu)','bleue',null,'Bleu prend un e au féminin.','Add e for the feminine form of bleu.'],
  ['Des maisons ___ (petit)','petites',null,'Maisons est féminin pluriel : petites.','Maisons is feminine plural: petites.'],
  ['Des garçons ___ (heureux)','heureux',null,'Heureux se termine déjà par x au singulier et au pluriel.','Heureux has the same masculine singular and plural spelling.']]],
 ['passe-compose','A2','conjugaison','Raconter au passé','Talking about the past','Le passé composé combine un auxiliaire au présent et un participe passé : j’ai mangé, elle est partie. Avec être, le participe s’accorde avec le sujet.','Use a present-tense auxiliary plus past participle. With être, agree the participle with the subject.',[
  ['Hier, j’ai ___ une pomme. (manger)','mangé',null,'Manger donne le participe passé mangé.','The past participle of manger is mangé.'],
  ['Elles sont ___ tôt. (partir)','parties',null,'Avec être, parties s’accorde avec elles.','With être, parties agrees with elles.'],
  ['Nous ___ fini le travail.','avons',['sommes','avons','ont'],'Finir se conjugue ici avec avoir.','Finir takes avoir here.']]],
 ['homophones','A2','orthographe','Éviter les confusions','Common spelling traps','A est le verbe avoir ; à est une préposition. Son indique la possession ; sont est le verbe être.','A and à sound alike but serve different functions. Son means his/her; sont means are.',[
  ['Elle va ___ Montréal.','à',['a','à'],'À introduit ici une destination.','À introduces a destination.'],
  ['Ils ___ prêts.','sont',['son','sont'],'On peut remplacer sont par étaient.','Sont is the plural form of être.'],
  ['Il ___ un billet.','a',['a','à'],'A peut être remplacé par avait.','A is a form of avoir; it can be replaced by avait.']]],
 ['imparfait','B1','conjugaison','Habitudes dans le passé','Past habits','L’imparfait décrit notamment une habitude passée : quand j’étais enfant, je jouais dehors. Terminaisons : -ais, -ais, -ait, -ions, -iez, -aient.','Use the imparfait for past habits or background descriptions.',[
  ['Chaque été, nous ___ chez nos cousins. (aller)','allions',null,'Nous à l’imparfait prend -ions.','The nous ending in the imparfait is -ions.'],
  ['Quand j’étais enfant, je ___ dehors. (jouer)','jouais',null,'Je à l’imparfait prend -ais.','The je ending is -ais.'],
  ['Avant, elles ___ à Yaoundé. (habiter)','habitaient',null,'Elles à l’imparfait prend -aient.','The elles ending is -aient.']]],
 ['connecteurs','B1','syntaxe','Relier ses idées','Connecting ideas','Parce que exprime la cause ; cependant marque une opposition ; donc indique une conséquence.','Parce que means because; cependant means however; donc means therefore.',[
  ['Je reste chez moi ___ je suis malade.','parce que',['cependant','parce que','donc'],'La maladie est la cause.','Illness is the cause.'],
  ['Il pleut ; ___, nous sortons.','cependant',['cependant','parce que','car'],'Cependant introduit une opposition.','Cependant introduces contrast.'],
  ['J’ai bien révisé ; je suis ___ mieux préparé.','donc',['parce que','donc','mais'],'Donc introduit une conséquence.','Donc introduces a consequence.']]],
 ['relatifs','B1','syntaxe','Qui ou que ?','Relative pronouns','Qui est sujet du verbe qui suit. Que est complément d’objet direct : la personne qui parle ; le livre que je lis.','Qui is the subject of the following verb; que is its direct object.',[
  ['La personne ___ parle est ma sœur.','qui',null,'Qui est sujet de parle.','Qui is the subject of parle.'],
  ['Le livre ___ je lis est intéressant.','que',null,'Je est le sujet ; que représente le livre, objet de lis.','Je is the subject; que stands for the object of lis.'],
  ['Les élèves ___ travaillent progressent.','qui',null,'Qui est sujet de travaillent.','Qui is the subject of travaillent.']]],
 ['subjonctif','B2','conjugaison','Exprimer une nécessité','Expressing necessity','Après il faut que, on emploie le subjonctif : il faut que tu sois prêt, que nous fassions attention.','Il faut que takes the subjunctive to express necessity.',[
  ['Il faut que tu ___ prêt. (être)','sois',null,'Être au subjonctif avec tu : sois.','The tu subjunctive of être is sois.'],
  ['Il faut que nous ___ attention. (faire)','fassions',null,'Faire au subjonctif avec nous : fassions.','The nous subjunctive of faire is fassions.'],
  ['Il faut qu’elle ___ à l’heure. (venir)','vienne',null,'Venir au subjonctif avec elle : vienne.','The elle subjunctive of venir is vienne.']]]
];
export const lessons = units.map(([id,level,skill,title,enTitle,rule,enRule,qs],i)=>({id,level,skill,title:{fr:title,en:enTitle},rule:{fr:rule,en:enRule},order:i+1,exercises:qs.map(([prompt,answer,choices,fr,en],j)=>({id:`${id}-${j+1}`,lessonId:id,level,skill,type:choices?'choice':'fill',prompt,answer,choices,explanation:{fr,en}}))}));
for(const lesson of lessons)lesson.exercises.push(...gameExercises.filter(e=>e.lessonId===lesson.id));
export const exercises = lessons.flatMap(l=>l.exercises);
export const publicExercise = ({answer,explanation,...e})=>e;
