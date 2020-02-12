// CreateDictionary.cs
// Credits to https://github.com/wolfgarbe/SymSpell/issues/15#issuecomment-350243639

using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Text;

class FrequencyDictionary {
 static void Main() {
  // Spelling dictionary
  // http://app.aspell.net/create?defaults=en_US
  // http://wordlist.aspell.net/
  string aspellScowlFilepath = @"scowl-60size-0var-en_US.txt";

  // Google ngrams
  // http://storage.googleapis.com/books/ngrams/books/datasetsv2.html
  String ngramsPrefix = @"googlebooks-eng-1M-1gram-20090715-";

  string destFile = @"frequency_dictionary_en_US_60size_1M_1gram_20090715.txt";

  Console.WriteLine("Creating aspell frequency dictionary");
  DictionaryFactory df = new DictionaryFactory();
  df.CreateWordFrequencyDictionary(aspellScowlFilepath, ngramsPrefix, destFile);
 }
}

class DictionaryFactory {
 Dictionary < string, Int64 > termlist = new Dictionary < string, Int64 > ();


 //create a word frequency dictionary
 public void CreateWordFrequencyDictionary(string scowlFilename, string googleBooksPrefix, string outputFilename) {
  HashSet < string > hs = new HashSet < string > ();
  using(StreamReader sr = new StreamReader(scowlFilename)) {
   String line;
   //process a single line at a time only for memory efficiency
   while ((line = sr.ReadLine()) != null) {
    if (line.Length < 1)
     continue;
    if (Char.IsUpper(line.Last()))
     continue; //do not allow abbreviations
    if ((line.Length <= 2) && Char.IsUpper(line.First()))
     continue;
    hs.Add(line.ToLower());
   }
  }


  string[] wordFilter = {
   "ha",
   "te",
   "sp",
   "th",
   "ca",
   "yu",
   "ms",
   "ins",
   "ith",
   "spp",
   "hou",
   "ewith",
   "fori"
  };

  // Dictionaries can have crazy UX effects.  You can provide some bad words to censor for a chatbot. (Note: you'll never win)
  // string[] badWords = File.ReadAllLines (@"bad-words.txt");

  for (int i = 0; i < 10; i++) {
   using(StreamReader sr = new StreamReader(googleBooksPrefix + i.ToString() + ".csv")) {
    String line;

    //process a single line at a time only for memory efficiency
    while ((line = sr.ReadLine()) != null) {
     string[] lineParts = line.Split('\t');
     if (lineParts.Length >= 3) {
      string key = lineParts[0].ToLower();

      //allow only terms from the google n-grams which are also in the SCOWL lis
      if (!hs.Contains(key))
       continue;

      //allow only terms which start with a letter
      if (!Char.IsLetter(key.First()))
       continue;

      //only a & i are genuine single letter english words
      if ((key.Length == 1) && (key != "a") && (key != "i"))
       continue;

      //addition filters
      if (key.EndsWith("."))
       continue;
      if ((key.Length == 2) && ((key.StartsWith("'")) || (key.EndsWith("'"))))
       continue;
      if (wordFilter.Contains(key))
       continue;

      // UNCOMMENT to remove bad words
      // if (badWords.Contains(key)) continue;

      //set word counts
      Int64 count;
      if (Int64.TryParse(lineParts[2], out count)) {
       //add to dictionary
       if (termlist.ContainsKey(key)) {
        termlist[key] += count;
       } else {
        termlist[key] = count;
       }
       // Console.WriteLine(key+" "+count.ToString("N0"));
      }
     }
    }
   }
  }

  //add some additional terms
  foreach(string key in new string[15] {
   "can't",
   "won't",
   "don't",
   "couldn't",
   "shouldn't",
   "wouldn't",
   "needn't",
   "mustn't",
   "she'll",
   "we'll",
   "he'll",
   "they'll",
   "i'll",
   "i'm",
   "wasn't"
  }) {
   termlist[key] = 300000;
  }

  //sort by frequency
  List < KeyValuePair < string, Int64 >> termlist2 = termlist.ToList();
  termlist2.Sort((x, y) => y.Value.CompareTo(x.Value));

  //limit size
  if (termlist2.Count > 500000)
   termlist2.RemoveRange(500000, termlist2.Count - 500000);

  //write new dict to file
  using(System.IO.StreamWriter file =
   new System.IO.StreamWriter(outputFilename, false, Encoding.UTF8)) {
   for (int i = 0; i < termlist2.Count; i++)
    file.WriteLine(termlist2[i].Key + " " + termlist2[i].Value.ToString());
  }

  Console.WriteLine("Ready: " + termlist.Count.ToString("N0") + " terms");
 }
}